import type { ConsultMode } from "@/lib/supabase/database.types";
import { formatDateLabel, formatPeso, formatTimeLabel, manilaDate } from "@/lib/booking/time";
import { buildIcs } from "./ics";

/**
 * Email templates. Each one turns a stored payload into a subject, HTML and plain text.
 * Emails carry only what a client already knows about their own booking (time, attorney,
 * place) and never case details, intake answers, message text or conflict matches: email
 * isn't a confidential channel, so anything sensitive stays behind a sign-in link.
 */

export interface BookingFacts {
  appointmentId: string;
  consultLabel: string;
  attorneyName: string;
  startsAt: string;
  endsAt: string;
  mode: ConsultMode;
  /** Office name and address (in person) or the meeting link (video). */
  where: string | null;
}

export interface TemplatePayloads {
  // To the client
  booking_confirmed: BookingFacts & { clientName: string; priceCentavos: number; cutoffHours: number };
  payment_receipt: { clientName: string; amountCentavos: number; description: string; paidAt: string; reference: string };
  booking_rescheduled: BookingFacts & { clientName: string; previousStartsAt: string };
  booking_canceled: BookingFacts & { clientName: string; by: "client" | "firm"; refundDue: boolean };
  booking_approved: BookingFacts & { clientName: string };
  booking_reassigned: BookingFacts & { clientName: string; previousAttorneyName: string };
  meeting_link_updated: BookingFacts & { clientName: string };
  /** threadId isn't shown; it limits alerts to one per thread every few minutes. */
  message_received: { clientName: string; attorneyName: string; threadId: string };
  payment_unplaced: { clientName: string; amountCentavos: number; consultLabel: string; startsAt: string };
  // To staff
  staff_new_booking: BookingFacts & { clientName: string; urgent: boolean; conflict: boolean; paid: boolean };
  staff_booking_canceled: BookingFacts & { clientName: string; refundDue: boolean };
  staff_booking_rescheduled: BookingFacts & { clientName: string; previousStartsAt: string };
  staff_booking_reassigned: BookingFacts & { clientName: string };
  staff_message_received: { clientName: string; threadId: string };
  staff_refund_due: { clientName: string; amountCentavos: number; reason: string; appointmentId: string | null };
  staff_invite: { inviterName: string; role: string; link: string; expiresAt: string };
}

export type TemplateName = keyof TemplatePayloads;

export interface RenderContext {
  firmName: string;
  siteUrl: string;
  /** Our sending address, used as the calendar file's organizer. */
  fromAddress: string;
  now?: Date;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  ics?: string;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "Mon, Nov 9, 2026 at 9:00 AM" in Manila time. */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const date = manilaDate(d);
  return `${formatDateLabel(date)}, ${date.slice(0, 4)} at ${formatTimeLabel(d)}`;
}

const MODE: Record<ConsultMode, string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In person",
};

function whereLine(f: BookingFacts): [string, string] {
  if (f.mode === "phone") return ["How", "The attorney will call your mobile number"];
  if (f.mode === "video") return ["Meeting link", f.where ?? "The firm will send the link before your consultation"];
  return ["Where", f.where ?? "The firm will confirm the office"];
}

const bookingDetails = (f: BookingFacts): [string, string][] => [
  ["When", `${whenLabel(f.startsAt)} (Philippine time)`],
  ["Consultation", `${f.consultLabel} · ${MODE[f.mode]}`],
  ["Attorney", f.attorneyName],
  whereLine(f),
];

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const isLink = (value: string) => /^https:\/\/\S+$/.test(value);

interface Message {
  subject: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  details?: [string, string][];
  action?: { label: string; href: string };
  after?: string[];
  audience: "client" | "staff";
  /** Replaces the standard footer. */
  footer?: string;
  ics?: string;
}

function toEmail(m: Message, ctx: RenderContext): RenderedEmail {
  const footer =
    m.footer ??
    (m.audience === "client"
      ? `This email is about your booking with ${ctx.firmName}. Replies go to the firm.`
      : `You're receiving this because you're on ${ctx.firmName}'s staff.`);

  const p = (text: string) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(text)}</p>`;
  const detailRows = (m.details ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b6f76;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;vertical-align:top">${
          isLink(value) ? `<a href="${escapeHtml(value)}" style="color:#1d4ed8">${escapeHtml(value)}</a>` : escapeHtml(value)
        }</td></tr>`,
    )
    .join("");

  const html = [
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2328;font-size:15px">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">`,
    `<div style="font-size:13px;color:#6b6f76;margin-bottom:6px">${escapeHtml(ctx.firmName)}</div>`,
    `<h1 style="font-size:20px;margin:0 0 18px;font-weight:600">${escapeHtml(m.heading)}</h1>`,
    m.greeting ? p(m.greeting) : "",
    ...m.paragraphs.map(p),
    detailRows ? `<table style="border-collapse:collapse;margin:4px 0 18px;font-size:14px">${detailRows}</table>` : "",
    m.action
      ? `<p style="margin:0 0 18px"><a href="${escapeHtml(m.action.href)}" style="display:inline-block;background:#1f2328;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:7px;font-weight:600">${escapeHtml(m.action.label)}</a></p>`
      : "",
    ...(m.after ?? []).map(p),
    `</div>`,
    `<p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#6b6f76;line-height:1.5">${escapeHtml(footer)}</p>`,
    `</body></html>`,
  ].join("");

  const text = [
    m.heading,
    "",
    ...(m.greeting ? [m.greeting, ""] : []),
    ...m.paragraphs.flatMap((t) => [t, ""]),
    ...(m.details?.length ? [...m.details.map(([label, value]) => `${label}: ${value}`), ""] : []),
    ...(m.action ? [`${m.action.label}: ${m.action.href}`, ""] : []),
    ...(m.after ?? []).flatMap((t) => [t, ""]),
    "--",
    footer,
  ].join("\n");

  return { subject: m.subject, html, text, ics: m.ics };
}

function calendar(f: BookingFacts, ctx: RenderContext, canceled = false): string {
  const now = ctx.now ?? new Date();
  return buildIcs(
    {
      uid: f.appointmentId,
      sequence: Math.floor(now.getTime() / 1000),
      startsAt: new Date(f.startsAt),
      endsAt: new Date(f.endsAt),
      summary: `${f.consultLabel} with ${f.attorneyName} (${ctx.firmName})`,
      description: `${MODE[f.mode]} consultation booked with ${ctx.firmName}. Manage it at ${ctx.siteUrl}/portal/appointments`,
      location: f.where,
      url: f.mode === "video" && f.where && isLink(f.where) ? f.where : null,
      organizerName: ctx.firmName,
      organizerEmail: ctx.fromAddress,
      canceled,
    },
    now,
  );
}

const hi = (name: string) => (name.trim() ? `Hi ${name.trim()},` : "Hello,");

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

type Builders = { [K in TemplateName]: (p: TemplatePayloads[K], ctx: RenderContext) => Message };

const builders: Builders = {
  booking_confirmed: (p, ctx) => ({
    audience: "client",
    subject: `Booked: ${p.consultLabel} with ${p.attorneyName}, ${whenLabel(p.startsAt)}`,
    heading: "Your consultation is booked",
    greeting: hi(p.clientName),
    paragraphs: [
      `Thank you for booking with ${ctx.firmName}.${p.priceCentavos > 0 ? ` We received your payment of ${formatPeso(p.priceCentavos)}.` : ""}`,
    ],
    details: bookingDetails(p),
    action: { label: "View your appointment", href: `${ctx.siteUrl}/portal/appointments` },
    after: [
      `You can cancel or reschedule online up to ${p.cutoffHours} hour${p.cutoffHours === 1 ? "" : "s"} before the start. A calendar file is attached.`,
    ],
    ics: calendar(p, ctx),
  }),

  payment_receipt: (p) => ({
    audience: "client",
    subject: `Receipt for ${formatPeso(p.amountCentavos)}`,
    heading: "Payment receipt",
    greeting: hi(p.clientName),
    paragraphs: ["We received your payment. Keep this email as your receipt."],
    details: [
      ["Amount", formatPeso(p.amountCentavos)],
      ["For", p.description],
      ["Paid", `${whenLabel(p.paidAt)} (Philippine time)`],
      ["Reference", p.reference],
    ],
  }),

  booking_rescheduled: (p, ctx) => ({
    audience: "client",
    subject: `Rescheduled: ${p.consultLabel}, now ${whenLabel(p.startsAt)}`,
    heading: "Your consultation has a new time",
    greeting: hi(p.clientName),
    paragraphs: [`Your consultation moved from ${whenLabel(p.previousStartsAt)} to the time below.`],
    details: bookingDetails(p),
    action: { label: "View your appointment", href: `${ctx.siteUrl}/portal/appointments` },
    after: ["The attached calendar file replaces the earlier one."],
    ics: calendar(p, ctx),
  }),

  booking_canceled: (p, ctx) => ({
    audience: "client",
    subject: `Canceled: ${p.consultLabel} on ${whenLabel(p.startsAt)}`,
    heading: p.by === "client" ? "Your consultation is canceled" : `${ctx.firmName} can't take this consultation`,
    greeting: hi(p.clientName),
    paragraphs: [
      p.by === "client"
        ? "As you asked, we canceled this consultation."
        : `${ctx.firmName} reviewed your booking and isn't able to take it. We're sorry for the inconvenience.`,
      ...(p.refundDue ? [`The firm will refund the fee you paid. Refunds can take several business days to reach you.`] : []),
    ],
    details: bookingDetails(p).slice(0, 3),
    action: { label: "Book another time", href: `${ctx.siteUrl}/portal/appointments` },
    ics: calendar(p, ctx, true),
  }),

  booking_approved: (p, ctx) => ({
    audience: "client",
    subject: `${p.attorneyName} accepted your consultation`,
    heading: "Your attorney accepted your booking",
    greeting: hi(p.clientName),
    paragraphs: [`${p.attorneyName} reviewed your booking and will see you as planned.`],
    details: bookingDetails(p),
    action: { label: "View your appointment", href: `${ctx.siteUrl}/portal/appointments` },
  }),

  booking_reassigned: (p, ctx) => ({
    audience: "client",
    subject: `Your consultation is now with ${p.attorneyName}`,
    heading: "Your consultation has a new attorney",
    greeting: hi(p.clientName),
    paragraphs: [`${ctx.firmName} moved your consultation from ${p.previousAttorneyName} to ${p.attorneyName}. The time is unchanged.`],
    details: bookingDetails(p),
    action: { label: "View your appointment", href: `${ctx.siteUrl}/portal/appointments` },
    after: ["The attached calendar file replaces the earlier one."],
    ics: calendar(p, ctx),
  }),

  meeting_link_updated: (p, ctx) => ({
    audience: "client",
    subject: `Meeting link for your consultation on ${whenLabel(p.startsAt)}`,
    heading: "Your meeting link",
    greeting: hi(p.clientName),
    paragraphs: ["The firm set the video link for your consultation."],
    details: bookingDetails(p),
    action: { label: "View your appointment", href: `${ctx.siteUrl}/portal/appointments` },
    ics: calendar(p, ctx),
  }),

  message_received: (p, ctx) => ({
    audience: "client",
    subject: `New message from ${p.attorneyName}`,
    heading: "You have a new message",
    greeting: hi(p.clientName),
    paragraphs: [`${p.attorneyName} of ${ctx.firmName} sent you a message. For your privacy, sign in to read it.`],
    action: { label: "Read the message", href: `${ctx.siteUrl}/portal/messages` },
  }),

  payment_unplaced: (p, ctx) => ({
    audience: "client",
    subject: `About your payment of ${formatPeso(p.amountCentavos)}`,
    heading: "Your payment arrived after the time was released",
    greeting: hi(p.clientName),
    paragraphs: [
      `We received your payment of ${formatPeso(p.amountCentavos)} for ${p.consultLabel} on ${whenLabel(p.startsAt)}, but it arrived after the reserved time had been released, so the booking couldn't be completed.`,
      `${ctx.firmName} will refund the full amount. You're welcome to book another time.`,
    ],
    action: { label: "See your account", href: `${ctx.siteUrl}/portal/appointments` },
  }),

  staff_new_booking: (p, ctx) => {
    const flags = [p.urgent ? "Urgent" : "", p.conflict ? "Possible conflict" : ""].filter(Boolean);
    return {
      audience: "staff",
      subject: `${flags.length ? `[${flags.join(", ")}] ` : ""}New booking: ${p.clientName}, ${whenLabel(p.startsAt)}`,
      heading: "New booking to review",
      paragraphs: [
        `${p.clientName} booked ${p.consultLabel} with ${p.attorneyName}${p.paid ? " and paid online" : ""}.`,
        ...(p.urgent ? ["The client marked this matter as urgent."] : []),
        ...(p.conflict ? ["The conflict check found possible matches. Review them before the consultation."] : []),
      ],
      details: bookingDetails(p).slice(0, 3),
      action: { label: "Review the booking", href: `${ctx.siteUrl}/staff/appointments/${p.appointmentId}` },
    };
  },

  staff_booking_canceled: (p, ctx) => ({
    audience: "staff",
    subject: `Canceled by client: ${p.clientName}, ${whenLabel(p.startsAt)}`,
    heading: "A client canceled",
    paragraphs: [
      `${p.clientName} canceled ${p.consultLabel} with ${p.attorneyName}. The time is open again.`,
      ...(p.refundDue ? ["They paid online, so Billing shows the fee as a refund due."] : []),
    ],
    details: bookingDetails(p).slice(0, 3),
    action: { label: "Open the booking", href: `${ctx.siteUrl}/staff/appointments/${p.appointmentId}` },
  }),

  staff_booking_rescheduled: (p, ctx) => ({
    audience: "staff",
    subject: `Rescheduled by client: ${p.clientName}, now ${whenLabel(p.startsAt)}`,
    heading: "A client rescheduled",
    paragraphs: [`${p.clientName} moved ${p.consultLabel} with ${p.attorneyName} from ${whenLabel(p.previousStartsAt)}.`],
    details: bookingDetails(p).slice(0, 3),
    action: { label: "Open the booking", href: `${ctx.siteUrl}/staff/appointments/${p.appointmentId}` },
  }),

  staff_booking_reassigned: (p, ctx) => ({
    audience: "staff",
    subject: `Assigned to you: ${p.clientName}, ${whenLabel(p.startsAt)}`,
    heading: "A booking was assigned to you",
    paragraphs: [`${p.consultLabel} with ${p.clientName} is now yours.`],
    details: bookingDetails(p).slice(0, 3),
    action: { label: "Open the booking", href: `${ctx.siteUrl}/staff/appointments/${p.appointmentId}` },
  }),

  staff_message_received: (p, ctx) => ({
    audience: "staff",
    subject: `New message from ${p.clientName}`,
    heading: "New client message",
    paragraphs: [`${p.clientName} sent a message. Sign in to read and reply.`],
    action: { label: "Open messages", href: `${ctx.siteUrl}/staff/messages` },
  }),

  staff_refund_due: (p, ctx) => ({
    audience: "staff",
    subject: `Refund due: ${formatPeso(p.amountCentavos)} to ${p.clientName}`,
    heading: "A payment needs a refund",
    paragraphs: [`${formatPeso(p.amountCentavos)} paid by ${p.clientName} should be refunded: ${p.reason}.`, "A partner can refund it from Billing."],
    action: { label: "Open Billing", href: `${ctx.siteUrl}/staff/billing` },
  }),

  staff_invite: (p, ctx) => ({
    audience: "staff",
    subject: `${p.inviterName} invited you to ${ctx.firmName}`,
    heading: `Join ${ctx.firmName}`,
    paragraphs: [`${p.inviterName} invited you to join ${ctx.firmName} as ${p.role === "admin" ? "an" : "a"} ${p.role}.`],
    action: { label: "Accept the invite", href: p.link },
    footer: `Someone at ${ctx.firmName} invited this address to their booking dashboard.`,
    after: [
      `The link works once and expires on ${whenLabel(p.expiresAt)} (Philippine time). If you weren't expecting this, you can ignore it.`,
    ],
  }),
};

export function renderEmail<K extends TemplateName>(template: K, payload: TemplatePayloads[K], ctx: RenderContext): RenderedEmail {
  return toEmail(builders[template](payload, ctx), ctx);
}

export const isTemplateName = (name: string): name is TemplateName => Object.hasOwn(builders, name);
