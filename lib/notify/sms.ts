import { formatDateLabel, formatTimeLabel, manilaDate } from "@/lib/booking/time";
import { dayWord, type BookingFacts } from "./templates";

/**
 * Text message templates. A text is short and anyone near the phone can read it, so it says
 * only who, when and how, plus a link to the portal. Never case details, never the meeting link
 * (that stays behind sign-in and in the email).
 */

export interface SmsPayloads {
  sms_reminder_24h: BookingFacts;
  sms_reminder_1h: BookingFacts;
}

export type SmsTemplateName = keyof SmsPayloads;

export interface SmsContext {
  firmName: string;
  siteUrl: string;
  now?: Date;
}

/** Firm names can be long; a text should stay within one or two parts. */
const shortName = (name: string) => {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length > 40 ? clean.slice(0, 41).replace(/\s+\S*$/, "") : clean;
};

const how = (f: BookingFacts) =>
  f.mode === "phone" ? "The attorney will call you." : f.mode === "video" ? "Join with the link in your email." : "Please arrive a few minutes early.";

const builders: { [K in SmsTemplateName]: (p: SmsPayloads[K], ctx: SmsContext) => string } = {
  sms_reminder_24h: (p, ctx) => {
    const d = new Date(p.startsAt);
    return `${shortName(ctx.firmName)}: Reminder of your consultation with ${p.attorneyName} ${dayWord(p.startsAt, ctx.now)}, ${formatDateLabel(manilaDate(d))} at ${formatTimeLabel(d)}. ${how(p)} Details: ${ctx.siteUrl}/portal/appointments`;
  },
  sms_reminder_1h: (p, ctx) =>
    `${shortName(ctx.firmName)}: Your consultation with ${p.attorneyName} starts at ${formatTimeLabel(new Date(p.startsAt))}. ${how(p)}`,
};

export function renderSms<K extends SmsTemplateName>(template: K, payload: SmsPayloads[K], ctx: SmsContext): string {
  return builders[template](payload, ctx);
}

export const isSmsTemplateName = (name: string): name is SmsTemplateName => Object.hasOwn(builders, name);
