import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { emailConfigured, emailEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { ResendError, sendEmail } from "./resend";
import { isTemplateName, renderEmail, type TemplateName, type TemplatePayloads } from "./templates";

/**
 * The email queue. Rows go into notification_log and are sent right after the response
 * (next/server `after`). Anything that fails is retried with backoff by the worker that
 * pg_cron calls every five minutes, so a slow or failing provider never blocks a booking.
 */

/** Waits before attempts 2, 3, 4, 5 and 6. After the sixth attempt the row is marked failed. */
export const RETRY_DELAYS_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;
/** An email that couldn't go out within a day is stale (the booking may have changed). */
const STALE_HOURS = 24;

export interface QueuedEmail<K extends TemplateName = TemplateName> {
  firmId: string;
  template: K;
  recipient: string;
  payload: TemplatePayloads[K];
  appointmentId?: string | null;
  /** The same key is only ever queued once. */
  dedupeKey: string;
}

/** A short, stable key part for values such as URLs. */
export const keyPart = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

export async function enqueueEmails(items: QueuedEmail[]): Promise<void> {
  const rows = items.filter((i) => i.recipient);
  if (!rows.length) return;
  if (!emailConfigured()) {
    console.warn("[notify] email isn't configured; not queuing", { templates: rows.map((r) => r.template) });
    return;
  }
  const { error } = await createAdminClient()
    .from("notification_log")
    .upsert(
      rows.map((r) => ({
        firm_id: r.firmId,
        channel: "email" as const,
        template: r.template,
        recipient: r.recipient.toLowerCase(),
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

export async function processQueue(limit = 20): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, retrying: 0, failed: 0 };
  if (!emailConfigured()) return result;
  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("[notify] claim failed", { code: error.code, message: error.message });
    return result;
  }

  const firms = new Map<string, { name: string; contact_email: string | null } | null>();
  const firmOf = async (id: string) => {
    if (!firms.has(id)) {
      const { data } = await admin.from("firms").select("name, contact_email").eq("id", id).maybeSingle();
      firms.set(id, data);
    }
    return firms.get(id) ?? null;
  };

  for (const row of rows ?? []) {
    const finish = async (fields: { status: "sent" | "failed" | "queued"; error?: string | null; provider_message_id?: string; next_attempt_at?: string }) => {
      await admin
        .from("notification_log")
        .update({ ...fields, locked_until: null, ...(fields.status === "sent" ? { sent_at: new Date().toISOString(), error: null } : {}) })
        .eq("id", row.id);
    };

    if (row.channel !== "email" || !isTemplateName(row.template)) {
      await finish({ status: "failed", error: `unknown template ${row.channel}/${row.template}` });
      result.failed++;
      continue;
    }
    if (Date.now() - new Date(row.created_at).getTime() > STALE_HOURS * 3_600_000) {
      await finish({ status: "failed", error: `not sent within ${STALE_HOURS} hours` });
      result.failed++;
      continue;
    }
    const firm = await firmOf(row.firm_id);
    if (!firm) {
      await finish({ status: "failed", error: "firm not found" });
      result.failed++;
      continue;
    }

    try {
      const email = renderEmail(row.template, row.payload as never, {
        firmName: firm.name,
        siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
        fromAddress: emailEnv().EMAIL_FROM,
      });
      const isClientEmail = !row.template.startsWith("staff_");
      const { id } = await sendEmail({
        fromName: firm.name,
        to: row.recipient,
        replyTo: isClientEmail ? firm.contact_email : null,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.ics ? [{ filename: "consultation.ics", content: email.ics, contentType: "text/calendar; charset=utf-8; method=" + (email.ics.includes("METHOD:CANCEL") ? "CANCEL" : "PUBLISH") }] : [],
        idempotencyKey: row.id,
      });
      await finish({ status: "sent", provider_message_id: id });
      result.sent++;
    } catch (error) {
      const message = (error instanceof ResendError ? `${error.status} ${error.message}` : String(error)).slice(0, 500);
      const retry = error instanceof ResendError && error.retryable && row.attempts < MAX_ATTEMPTS;
      if (retry) {
        const delay = RETRY_DELAYS_MINUTES[row.attempts - 1] ?? RETRY_DELAYS_MINUTES.at(-1)!;
        await finish({ status: "queued", error: message, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() });
        result.retrying++;
      } else {
        await finish({ status: "failed", error: message });
        result.failed++;
      }
      console.error("[notify] email failed", { id: row.id, template: row.template, attempt: row.attempts, message, retry });
    }
  }
  return result;
}
