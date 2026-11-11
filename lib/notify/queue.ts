import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { emailConfigured, emailEnv, smsConfigured } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";
import { PLATFORM } from "@/lib/brand";
import { manilaDate } from "@/lib/booking/time";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { SmsError, sendSms } from "./philsms";
import { ResendError, sendEmail } from "./resend";
import { isSmsTemplateName, renderSms, type SmsPayloads, type SmsTemplateName } from "./sms";
import { isTemplateName, renderEmail, type TemplateName, type TemplatePayloads } from "./templates";

/**
 * The notification queue. Rows go into notification_log and are sent right after the response
 * (next/server `after`). Anything that fails is retried with backoff by the worker that
 * pg_cron calls every five minutes, so a slow or failing provider never blocks a booking.
 * Emails go through Resend and texts through PhilSMS; texts count against the firm's monthly cap.
 */

/** Waits before attempts 2, 3, 4, 5 and 6. After the sixth attempt the row is marked failed. */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
/** A notification that couldn't go out within a day is stale (the booking may have changed). */
const STALE_HOURS = 24;

/** Reminders are only worth sending while the booking they describe still stands. */
const REMINDERS = new Set(["reminder_24h", "reminder_1h", "sms_reminder_24h", "sms_reminder_1h"]);

export const SMS_LIMIT_ERROR = "skipped: the firm's monthly text limit is reached";

export interface QueuedEmail<K extends TemplateName = TemplateName> {
  channel?: "email";
  firmId: string;
  template: K;
  recipient: string;
  payload: TemplatePayloads[K];
  appointmentId?: string | null;
  /** The same key is only ever queued once. */
  dedupeKey: string;
}

export interface QueuedSms<K extends SmsTemplateName = SmsTemplateName> {
  channel: "sms";
  firmId: string;
  template: K;
  /** 639XXXXXXXXX */
  recipient: string;
  payload: SmsPayloads[K];
  appointmentId?: string | null;
  dedupeKey: string;
}

export type QueuedNotification = QueuedEmail | QueuedSms;

/** A short, stable key part for values such as URLs. */
export const keyPart = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

/** The month a text counts toward, "YYYY-MM-01" in Philippine time (matches sms_month()). */
export const smsMonth = (now = new Date()) => `${manilaDate(now).slice(0, 7)}-01`;

export async function enqueue(items: QueuedNotification[]): Promise<void> {
  const email = emailConfigured();
  const sms = smsConfigured();
  const rows = items.filter((i) => i.recipient && (i.channel === "sms" ? sms : email));
  const dropped = items.length - rows.length;
  if (dropped) console.warn("[notify] channel isn't configured; not queuing", { templates: items.filter((i) => !rows.includes(i)).map((r) => r.template) });
  if (!rows.length) return;
  const { error } = await createAdminClient()
    .from("notification_log")
    .upsert(
      rows.map((r) => ({
        firm_id: r.firmId,
        channel: r.channel ?? ("email" as const),
        template: r.template,
        recipient: r.channel === "sms" ? r.recipient : r.recipient.toLowerCase(),
        appointment_id: r.appointmentId ?? null,
        payload: r.payload as unknown as Json,
        dedupe_key: r.dedupeKey,
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
  if (error) console.error("[notify] queue insert failed", { code: error.code, message: error.message });
}

/** Sends what was just queued once the response is out. The scheduled worker is the backstop. */
export function sendSoon() {
  try {
    after(() => processQueue().catch((error) => console.error("[notify] send failed", { message: (error as Error).message })));
  } catch {
    // Not inside a request (a script, say): the scheduled worker sends it.
  }
}

export interface ProcessResult {
  sent: number;
  retrying: number;
  failed: number;
}

type Row = Database["public"]["Tables"]["notification_log"]["Row"];
type Admin = ReturnType<typeof createAdminClient>;
type Firm = { name: string; contact_email: string | null; sms_monthly_cap: number };

/** Thrown inside a send to fail the row at once, without a retry. */
class Skip extends Error {}

export async function processQueue(limit = 20): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, retrying: 0, failed: 0 };
  if (!emailConfigured() && !smsConfigured()) return result;
  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("[notify] claim failed", { code: error.code, message: error.message });
    return result;
  }

  const firms = new Map<string, Firm | null>();
  const firmOf = async (id: string) => {
    if (!firms.has(id)) {
      const { data } = await admin.from("firms").select("name, contact_email, sms_monthly_cap").eq("id", id).maybeSingle();
      firms.set(id, data);
    }
    return firms.get(id) ?? null;
  };
  const capped = new Map<string, number>();

  for (const row of rows ?? []) {
    const finish = async (fields: { status: "sent" | "failed" | "queued"; error?: string | null; provider_message_id?: string; next_attempt_at?: string }) => {
      await admin
        .from("notification_log")
        .update({ ...fields, locked_until: null, ...(fields.status === "sent" ? { sent_at: new Date().toISOString(), error: null } : {}) })
        .eq("id", row.id);
    };
    const fail = async (message: string) => {
      await finish({ status: "failed", error: message });
      result.failed++;
    };

    const known = row.channel === "sms" ? isSmsTemplateName(row.template) : isTemplateName(row.template);
    if (!known) {
      await fail(`unknown template ${row.channel}/${row.template}`);
      continue;
    }
    if (row.channel === "sms" ? !smsConfigured() : !emailConfigured()) {
      await fail(`${row.channel} isn't configured`);
      continue;
    }
    if (Date.now() - new Date(row.created_at).getTime() > STALE_HOURS * 3_600_000) {
      await fail(`not sent within ${STALE_HOURS} hours`);
      continue;
    }
    const firm = await firmOf(row.firm_id);
    if (!firm) {
      await fail("firm not found");
      continue;
    }
    const stale = REMINDERS.has(row.template) ? await staleReminder(admin, row) : null;
    if (stale) {
      await fail(`skipped: ${stale}`);
      continue;
    }

    try {
      const id = row.channel === "sms" ? await deliverSms(admin, row, firm, capped) : await deliverEmail(row, firm);
      await finish({ status: "sent", provider_message_id: id });
      result.sent++;
    } catch (error) {
      if (error instanceof Skip) {
        await fail(error.message);
        continue;
      }
      const known = error instanceof ResendError || error instanceof SmsError;
      const message = (known ? `${error.status} ${error.message}` : String(error)).slice(0, 500);
      const retry = known && error.retryable && row.attempts < MAX_ATTEMPTS;
      if (retry) {
        const delay = RETRY_DELAYS_MINUTES[row.attempts - 1] ?? RETRY_DELAYS_MINUTES.at(-1)!;
        await finish({ status: "queued", error: message, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() });
        result.retrying++;
      } else {
        await fail(message);
      }
      console.error(`[notify] ${row.channel} failed`, { id: row.id, template: row.template, attempt: row.attempts, message, retry });
    }
  }

  if (capped.size) {
    const { notifySmsLimitReached } = await import("./events");
    for (const [firmId, cap] of capped) await notifySmsLimitReached(firmId, cap, smsMonth());
  }
  return result;
}

async function deliverEmail(row: Row, firm: Firm): Promise<string> {
  const template = row.template as TemplateName;
  // Platform emails come from us, not the firm, and replies don't go to the firm.
  const platform = template.startsWith("platform_");
  const email = renderEmail(template, row.payload as never, {
    firmName: firm.name,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    fromAddress: emailEnv().EMAIL_FROM,
    senderName: platform ? PLATFORM.name : undefined,
  });
  const isClientEmail = !template.startsWith("staff_") && !platform;
  const { id } = await sendEmail({
    fromName: platform ? PLATFORM.name : firm.name,
    to: row.recipient,
    replyTo: isClientEmail ? firm.contact_email : null,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: email.ics ? [{ filename: "consultation.ics", content: email.ics, contentType: "text/calendar; charset=utf-8; method=" + (email.ics.includes("METHOD:CANCEL") ? "CANCEL" : "PUBLISH") }] : [],
    idempotencyKey: row.id,
  });
  return id;
}

/** Takes one text from the firm's monthly allowance, sends it, and gives it back if nothing went out. */
async function deliverSms(admin: Admin, row: Row, firm: Firm, capped: Map<string, number>): Promise<string> {
  const message = renderSms(row.template as SmsTemplateName, row.payload as never, { firmName: firm.name, siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL });
  const month = smsMonth();
  const { data: reserved, error } = await admin.rpc("reserve_sms", { p_firm: row.firm_id });
  if (error) throw new SmsError(503, `reserve failed: ${error.message}`, true);
  if (!reserved) {
    capped.set(row.firm_id, firm.sms_monthly_cap);
    throw new Skip(SMS_LIMIT_ERROR);
  }
  try {
    return (await sendSms({ to: row.recipient, message })).id;
  } catch (error) {
    if (error instanceof SmsError && error.notSent) await admin.rpc("release_sms", { p_firm: row.firm_id, p_month: month });
    throw error;
  }
}

/** Why a queued reminder no longer applies, or null if it does. */
async function staleReminder(admin: Admin, row: Row): Promise<string | null> {
  const startsAt = (row.payload as { startsAt?: string } | null)?.startsAt;
  if (!row.appointment_id || !startsAt) return "reminder has no booking";
  const { data: a } = await admin.from("appointments").select("status, starts_at").eq("id", row.appointment_id).maybeSingle();
  if (!a || a.status !== "confirmed") return "the booking is no longer confirmed";
  if (new Date(a.starts_at).getTime() !== new Date(startsAt).getTime()) return "the booking moved";
  if (new Date(a.starts_at).getTime() <= Date.now()) return "the consultation already started";
  return null;
}
