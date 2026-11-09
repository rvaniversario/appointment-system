import "server-only";
import { emailConfigured, emailEnv } from "@/lib/env.server";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueEmails, keyPart, sendSoon, type QueuedEmail } from "./queue";
import { ResendError, sendEmail } from "./resend";
import { renderEmail, type BookingFacts } from "./templates";

/**
 * What happened, and who should hear about it. Each function is called after its change has
 * been saved, loads what the emails need with the service role, queues them and sends them
 * after the response. None of them throws: a notification problem never undoes a booking.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Staff are alerted about a message at most once per thread in this window. */
const MESSAGE_ALERT_MINUTES = 15;

interface Booking {
  firmId: string;
  attorneyId: string;
  attorneyProfileId: string | null;
  priceCentavos: number;
  cutoffHours: number;
  client: { id: string; email: string; name: string } | null;
  facts: BookingFacts;
}

const fullName = (p: { first_name: string; last_name: string } | null | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : "";

async function loadBooking(admin: Admin, appointmentId: string): Promise<Booking | null> {
  const { data: a } = await admin
    .from("appointments")
    .select("id, firm_id, attorney_id, client_id, consult_type_id, starts_at, ends_at, meeting_url, price_centavos")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!a) return null;

  const [{ data: consult }, { data: attorney }, { data: firm }, { data: client }] = await Promise.all([
    admin.from("consult_types").select("label, mode").eq("id", a.consult_type_id).maybeSingle(),
    admin.from("attorneys").select("full_name, profile_id, office_id").eq("id", a.attorney_id).maybeSingle(),
    admin.from("firms").select("cancellation_cutoff_hours").eq("id", a.firm_id).maybeSingle(),
    a.client_id
      ? admin.from("profiles").select("id, email, first_name, last_name").eq("id", a.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!consult || !attorney) return null;

  let where: string | null = null;
  if (consult.mode === "video") where = a.meeting_url;
  if (consult.mode === "in_person" && attorney.office_id) {
    const { data: office } = await admin.from("offices").select("name, address").eq("id", attorney.office_id).maybeSingle();
    if (office) where = [office.name, office.address].filter(Boolean).join(", ");
  }

  return {
    firmId: a.firm_id,
    attorneyId: a.attorney_id,
    attorneyProfileId: attorney.profile_id,
    priceCentavos: a.price_centavos,
    cutoffHours: firm?.cancellation_cutoff_hours ?? 24,
    client: client ? { id: client.id, email: client.email, name: client.first_name.trim() } : null,
    facts: {
      appointmentId: a.id,
      consultLabel: consult.label,
      attorneyName: attorney.full_name,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      mode: consult.mode,
      where,
    },
  };
}

/** The client's full name as staff know it, from the booking's intake, else the profile. */
async function clientFullName(admin: Admin, appointmentId: string, clientId: string | null): Promise<string> {
  const { data: intake } = await admin.from("intakes").select("first_name, last_name").eq("appointment_id", appointmentId).maybeSingle();
  if (intake) return fullName(intake);
  if (!clientId) return "A client";
  const { data } = await admin.from("profiles").select("first_name, last_name").eq("id", clientId).maybeSingle();
  return fullName(data) || "A client";
}

async function emailsOf(admin: Admin, profileIds: string[]): Promise<string[]> {
  if (!profileIds.length) return [];
  const { data } = await admin.from("profiles").select("email").in("id", profileIds);
  return [...new Set((data ?? []).map((p) => p.email.toLowerCase()).filter(Boolean))];
}

async function managerEmails(admin: Admin, firmId: string): Promise<string[]> {
  const { data } = await admin.from("firm_memberships").select("profile_id").eq("firm_id", firmId).in("role", ["partner", "admin"]);
  return emailsOf(admin, (data ?? []).map((m) => m.profile_id));
}

/**
 * Staff to tell about a booking: its attorney (if their profile is linked to an account),
 * plus the firm's partners and admins when `managers` is set or nobody else would hear.
 */
async function staffFor(admin: Admin, b: Pick<Booking, "firmId" | "attorneyProfileId">, managers: boolean): Promise<string[]> {
  const attorney = b.attorneyProfileId ? await emailsOf(admin, [b.attorneyProfileId]) : [];
  const extra = managers || !attorney.length ? await managerEmails(admin, b.firmId) : [];
  return [...new Set([...attorney, ...extra])];
}

async function run(label: string, work: (admin: Admin) => Promise<QueuedEmail[]>) {
  try {
    const items = await work(createAdminClient());
    await enqueueEmails(items);
    if (items.length) sendSoon();
  } catch (error) {
    console.error(`[notify] ${label} failed`, { message: (error as Error).message });
  }
}

/** The paid, not yet refunded, online payment for a booking, if any. */
async function paidPayment(admin: Admin, appointmentId: string) {
  const { data } = await admin
    .from("payments")
    .select("id, amount_centavos, refunded_centavos")
    .eq("appointment_id", appointmentId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data && data.refunded_centavos < data.amount_centavos ? data : null;
}

function refundDueAlerts(firmId: string, managers: string[], payment: { id: string; amount_centavos: number }, clientName: string, reason: string, appointmentId: string | null): QueuedEmail[] {
  return managers.map((to) => ({
    firmId,
    template: "staff_refund_due" as const,
    recipient: to,
    appointmentId,
    dedupeKey: `staff_refund_due:${payment.id}:${to}`,
    payload: { clientName, amountCentavos: payment.amount_centavos, reason, appointmentId },
  }));
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/** A booking was confirmed (free, or paid). Pass the payment for a paid one. */
export function notifyBookingConfirmed(appointmentId: string, paymentId?: string) {
  return run("booking confirmed", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b) return [];
    const [{ data: intake }, { count: conflicts }, payment] = await Promise.all([
      admin.from("intakes").select("first_name, last_name, urgency").eq("appointment_id", appointmentId).maybeSingle(),
      admin.from("conflict_hits").select("id", { count: "exact", head: true }).eq("appointment_id", appointmentId),
      paymentId
        ? admin.from("payments").select("id, amount_centavos, invoice_id, updated_at").eq("id", paymentId).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);
    const clientName = fullName(intake) || "A client";
    const urgent = intake?.urgency === "urgent";
    const conflict = (conflicts ?? 0) > 0;
    const items: QueuedEmail[] = [];

    if (b.client) {
      items.push({
        firmId: b.firmId,
        template: "booking_confirmed",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `booking_confirmed:${appointmentId}`,
        payload: { ...b.facts, clientName: intake?.first_name ?? b.client.name, priceCentavos: payment ? payment.amount_centavos : 0, cutoffHours: b.cutoffHours },
      });
      if (payment) {
        items.push({
          firmId: b.firmId,
          template: "payment_receipt",
          recipient: b.client.email,
          appointmentId,
          dedupeKey: `payment_receipt:${payment.id}`,
          payload: {
            clientName: intake?.first_name ?? b.client.name,
            amountCentavos: payment.amount_centavos,
            description: `${b.facts.consultLabel} with ${b.facts.attorneyName}`,
            paidAt: payment.updated_at,
            reference: (payment.invoice_id ?? payment.id).slice(0, 8).toUpperCase(),
          },
        });
      }
    }

    for (const to of await staffFor(admin, b, urgent || conflict)) {
      items.push({
        firmId: b.firmId,
        template: "staff_new_booking",
        recipient: to,
        appointmentId,
        dedupeKey: `staff_new_booking:${appointmentId}:${to}`,
        payload: { ...b.facts, clientName, urgent, conflict, paid: Boolean(payment) },
      });
    }
    return items;
  });
}

/** A payment arrived after its booking's time was given away. The firm owes a refund. */
export function notifyPaymentUnplaced(paymentId: string) {
  return run("unplaced payment", async (admin) => {
    const { data: payment } = await admin
      .from("payments")
      .select("id, firm_id, client_id, appointment_id, amount_centavos")
      .eq("id", paymentId)
      .maybeSingle();
    if (!payment) return [];
    const b = payment.appointment_id ? await loadBooking(admin, payment.appointment_id) : null;
    const clientName = payment.appointment_id ? await clientFullName(admin, payment.appointment_id, payment.client_id) : "A client";
    const items: QueuedEmail[] = [];

    const clientId = payment.client_id ?? b?.client?.id;
    if (clientId) {
      const { data: client } = await admin.from("profiles").select("email, first_name").eq("id", clientId).maybeSingle();
      if (client) {
        items.push({
          firmId: payment.firm_id,
          template: "payment_unplaced",
          recipient: client.email,
          appointmentId: payment.appointment_id,
          dedupeKey: `payment_unplaced:${payment.id}`,
          payload: {
            clientName: client.first_name,
            amountCentavos: payment.amount_centavos,
            consultLabel: b?.facts.consultLabel ?? "your consultation",
            startsAt: b?.facts.startsAt ?? new Date().toISOString(),
          },
        });
      }
    }
    const reason = "the payment arrived after the booking's time was released";
    items.push(...refundDueAlerts(payment.firm_id, await managerEmails(admin, payment.firm_id), payment, clientName, reason, payment.appointment_id));
    return items;
  });
}

/** The client canceled, or the firm declined. */
export function notifyCanceled(appointmentId: string, by: "client" | "firm") {
  return run("cancellation", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b) return [];
    const payment = await paidPayment(admin, appointmentId);
    const clientName = await clientFullName(admin, appointmentId, b.client?.id ?? null);
    const items: QueuedEmail[] = [];

    if (b.client) {
      items.push({
        firmId: b.firmId,
        template: "booking_canceled",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `booking_canceled:${appointmentId}`,
        payload: { ...b.facts, clientName: b.client.name, by, refundDue: Boolean(payment) },
      });
    }
    // Staff who declined already know; the attorney hears when the client cancels.
    if (by === "client") {
      for (const to of await staffFor(admin, b, false)) {
        items.push({
          firmId: b.firmId,
          template: "staff_booking_canceled",
          recipient: to,
          appointmentId,
          dedupeKey: `staff_booking_canceled:${appointmentId}:${to}`,
          payload: { ...b.facts, clientName, refundDue: Boolean(payment) },
        });
      }
    }
    if (payment) {
      const reason = by === "client" ? "the client canceled before the cutoff" : "the firm declined the booking";
      items.push(...refundDueAlerts(b.firmId, await managerEmails(admin, b.firmId), payment, clientName, reason, appointmentId));
    }
    return items;
  });
}

/** The client moved their booking to a new time. */
export function notifyRescheduled(appointmentId: string, previousStartsAt: string) {
  return run("reschedule", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b) return [];
    const clientName = await clientFullName(admin, appointmentId, b.client?.id ?? null);
    const stamp = new Date(b.facts.startsAt).getTime();
    const items: QueuedEmail[] = [];
    if (b.client) {
      items.push({
        firmId: b.firmId,
        template: "booking_rescheduled",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `booking_rescheduled:${appointmentId}:${stamp}`,
        payload: { ...b.facts, clientName: b.client.name, previousStartsAt },
      });
    }
    for (const to of await staffFor(admin, b, false)) {
      items.push({
        firmId: b.firmId,
        template: "staff_booking_rescheduled",
        recipient: to,
        appointmentId,
        dedupeKey: `staff_booking_rescheduled:${appointmentId}:${stamp}:${to}`,
        payload: { ...b.facts, clientName, previousStartsAt },
      });
    }
    return items;
  });
}

export function notifyApproved(appointmentId: string) {
  return run("approval", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b?.client) return [];
    return [
      {
        firmId: b.firmId,
        template: "booking_approved",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `booking_approved:${appointmentId}`,
        payload: { ...b.facts, clientName: b.client.name },
      },
    ];
  });
}

/** A partner or admin moved the booking to another attorney. */
export function notifyReassigned(appointmentId: string, previousAttorneyId: string) {
  return run("reassignment", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b) return [];
    const { data: previous } = await admin.from("attorneys").select("full_name").eq("id", previousAttorneyId).maybeSingle();
    const clientName = await clientFullName(admin, appointmentId, b.client?.id ?? null);
    const items: QueuedEmail[] = [];
    if (b.client) {
      items.push({
        firmId: b.firmId,
        template: "booking_reassigned",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `booking_reassigned:${appointmentId}:${b.attorneyId}`,
        payload: { ...b.facts, clientName: b.client.name, previousAttorneyName: previous?.full_name ?? "your previous attorney" },
      });
    }
    // Only the new attorney: whoever reassigned it is a manager and already knows.
    const attorney = b.attorneyProfileId ? await emailsOf(admin, [b.attorneyProfileId]) : [];
    for (const to of attorney) {
      items.push({
        firmId: b.firmId,
        template: "staff_booking_reassigned",
        recipient: to,
        appointmentId,
        dedupeKey: `staff_booking_reassigned:${appointmentId}:${b.attorneyId}:${to}`,
        payload: { ...b.facts, clientName },
      });
    }
    return items;
  });
}

/** Staff set a video meeting link. Clearing it sends nothing. */
export function notifyMeetingLink(appointmentId: string) {
  return run("meeting link", async (admin) => {
    const b = await loadBooking(admin, appointmentId);
    if (!b?.client || b.facts.mode !== "video" || !b.facts.where) return [];
    return [
      {
        firmId: b.firmId,
        template: "meeting_link_updated",
        recipient: b.client.email,
        appointmentId,
        dedupeKey: `meeting_link_updated:${appointmentId}:${keyPart(b.facts.where)}`,
        payload: { ...b.facts, clientName: b.client.name },
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Tells the other side of a thread that a message arrived, without its text. Each recipient
 * gets at most one alert per thread every few minutes, so a conversation isn't an email storm.
 */
export function notifyMessage(messageId: string) {
  return run("message", async (admin) => {
    const { data: message } = await admin.from("messages").select("id, thread_id, sender_id").eq("id", messageId).maybeSingle();
    if (!message) return [];
    const { data: thread } = await admin.from("message_threads").select("id, firm_id, client_id, attorney_id").eq("id", message.thread_id).maybeSingle();
    if (!thread) return [];
    const { data: attorney } = await admin.from("attorneys").select("full_name, profile_id").eq("id", thread.attorney_id).maybeSingle();
    const fromClient = message.sender_id === thread.client_id;

    let recipients: string[];
    let item: (to: string) => QueuedEmail;
    if (fromClient) {
      const { data: client } = await admin.from("profiles").select("first_name, last_name").eq("id", thread.client_id).maybeSingle();
      recipients = await staffFor(admin, { firmId: thread.firm_id, attorneyProfileId: attorney?.profile_id ?? null }, false);
      item = (to) => ({
        firmId: thread.firm_id,
        template: "staff_message_received",
        recipient: to,
        dedupeKey: `staff_message_received:${message.id}:${to}`,
        payload: { clientName: fullName(client) || "A client", threadId: thread.id },
      });
    } else {
      const { data: client } = await admin.from("profiles").select("email, first_name").eq("id", thread.client_id).maybeSingle();
      recipients = client ? [client.email.toLowerCase()] : [];
      item = (to) => ({
        firmId: thread.firm_id,
        template: "message_received",
        recipient: to,
        dedupeKey: `message_received:${message.id}`,
        payload: { clientName: client?.first_name ?? "", attorneyName: attorney?.full_name ?? "Your attorney", threadId: thread.id },
      });
    }

    const template = fromClient ? "staff_message_received" : "message_received";
    const since = new Date(Date.now() - MESSAGE_ALERT_MINUTES * 60_000).toISOString();
    const { data: recent } = await admin
      .from("notification_log")
      .select("recipient")
      .eq("firm_id", thread.firm_id)
      .eq("template", template)
      .eq("payload->>threadId", thread.id)
      .gte("created_at", since);
    const alerted = new Set((recent ?? []).map((r) => r.recipient));

    return recipients.filter((to) => !alerted.has(to)).map(item);
  });
}

// ---------------------------------------------------------------------------
// Staff invites
// ---------------------------------------------------------------------------

export interface InviteEmailResult {
  sent: boolean;
}

/**
 * Emails a staff invite link right away. It's sent directly instead of queued, because the
 * link is a secret: only its hash is stored, so a queued copy could never be retried. The
 * send is still logged, without the link.
 */
export async function sendInviteEmail(input: {
  firmId: string;
  inviteId: string;
  to: string;
  inviterName: string;
  role: string;
  link: string;
  expiresAt: string;
}): Promise<InviteEmailResult> {
  if (!emailConfigured()) return { sent: false };
  const admin = createAdminClient();
  const { data: firm } = await admin.from("firms").select("name").eq("id", input.firmId).maybeSingle();
  if (!firm) return { sent: false };

  const email = renderEmail(
    "staff_invite",
    { inviterName: input.inviterName, role: input.role, link: input.link, expiresAt: input.expiresAt },
    { firmName: firm.name, siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, fromAddress: emailEnv().EMAIL_FROM },
  );
  const log = {
    firm_id: input.firmId,
    channel: "email" as const,
    template: "staff_invite",
    recipient: input.to,
    dedupe_key: `staff_invite:${input.inviteId}`,
    attempts: 1,
  };
  try {
    const { id } = await sendEmail({ fromName: firm.name, to: input.to, subject: email.subject, html: email.html, text: email.text, idempotencyKey: `invite-${input.inviteId}` });
    await admin.from("notification_log").insert({ ...log, status: "sent", provider_message_id: id, sent_at: new Date().toISOString() });
    return { sent: true };
  } catch (error) {
    const message = error instanceof ResendError ? `${error.status} ${error.message}` : String(error);
    console.error("[notify] invite email failed", { message });
    await admin.from("notification_log").insert({ ...log, status: "failed", error: message.slice(0, 500) });
    return { sent: false };
  }
}

// ---------------------------------------------------------------------------
// Guest email codes
// ---------------------------------------------------------------------------

/**
 * Emails a guest the code that confirms their address. Sent directly, like invites, and
 * logged without the code. `send` numbers the codes for one booking, so each is its own
 * Resend idempotency key.
 */
export async function sendBookingEmailCode(input: {
  firmId: string;
  appointmentId: string;
  to: string;
  code: string;
  minutes: number;
  send: number;
}): Promise<{ sent: boolean }> {
  if (!emailConfigured()) return { sent: false };
  const admin = createAdminClient();
  const { data: firm } = await admin.from("firms").select("name, contact_email").eq("id", input.firmId).maybeSingle();
  if (!firm) return { sent: false };

  const email = renderEmail(
    "booking_email_code",
    { code: input.code, minutes: input.minutes },
    { firmName: firm.name, siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, fromAddress: emailEnv().EMAIL_FROM },
  );
  const log = {
    firm_id: input.firmId,
    channel: "email" as const,
    template: "booking_email_code",
    recipient: input.to,
    appointment_id: input.appointmentId,
    dedupe_key: `booking_email_code:${input.appointmentId}:${input.send}`,
    attempts: 1,
  };
  try {
    const { id } = await sendEmail({
      fromName: firm.name,
      to: input.to,
      replyTo: firm.contact_email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      idempotencyKey: `booking-code-${input.appointmentId}-${input.send}`,
    });
    await admin.from("notification_log").insert({ ...log, status: "sent", provider_message_id: id, sent_at: new Date().toISOString() });
    return { sent: true };
  } catch (error) {
    const message = error instanceof ResendError ? `${error.status} ${error.message}` : String(error);
    console.error("[notify] booking code email failed", { message });
    await admin.from("notification_log").insert({ ...log, status: "failed", error: message.slice(0, 500) });
    return { sent: false };
  }
}
