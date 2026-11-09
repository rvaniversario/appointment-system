import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this file from a Client Component fails the build
 * (via "server-only"), so secrets can never reach the browser bundle.
 * Parsed lazily so routes that don't need a secret still work without it.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (!cached) cached = serverSchema.parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
  return cached;
}

const paymentsSchema = z.object({
  /** The platform's (parent) PayMongo secret key. */
  PAYMONGO_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, "must be a PayMongo secret key (sk_test_… or sk_live_…)"),
  /** Overridable so tests can point at a local mock. */
  PAYMONGO_API_BASE: z.url().default("https://api.paymongo.com"),
});

let cachedPayments: z.infer<typeof paymentsSchema> | null = null;

/** PayMongo settings. Throws if payments aren't configured; check paymentsConfigured() first. */
export function paymentsEnv() {
  if (!cachedPayments) {
    cachedPayments = paymentsSchema.parse({
      PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY,
      PAYMONGO_API_BASE: process.env.PAYMONGO_API_BASE || undefined,
    });
  }
  return cachedPayments;
}

export const paymentsConfigured = () => paymentsSchema.safeParse({ PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY }).success;

const emailSchema = z.object({
  RESEND_API_KEY: z.string().regex(/^re_/, "must be a Resend API key (re_…)"),
  /** A bare address on our verified domain, e.g. notifications@mail.example.com. Firm names go in front of it. */
  EMAIL_FROM: z.email(),
  /** Overridable so tests can point at a local mock. */
  RESEND_API_BASE: z.url().default("https://api.resend.com"),
});

let cachedEmail: z.infer<typeof emailSchema> | null = null;

/** Resend settings. Throws if email isn't configured; check emailConfigured() first. */
export function emailEnv() {
  if (!cachedEmail) {
    cachedEmail = emailSchema.parse({
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      RESEND_API_BASE: process.env.RESEND_API_BASE || undefined,
    });
  }
  return cachedEmail;
}

export const emailConfigured = () =>
  emailSchema.safeParse({ RESEND_API_KEY: process.env.RESEND_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM }).success;

/** Shared secret that scheduled jobs send as "Authorization: Bearer <secret>". */
export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return value && value.length >= 32 ? value : null;
}

const smsSchema = z.object({
  PHILSMS_API_TOKEN: z.string().min(10),
  /** The sender name PhilSMS approved for us: up to 11 letters and digits, or a number. */
  PHILSMS_SENDER_ID: z.string().regex(/^([A-Za-z0-9 ]{1,11}|\d{10,15})$/, "must be an approved PhilSMS sender ID (up to 11 letters or digits)"),
  /** The current PhilSMS platform (the old app.philsms.com is retired). Overridable so tests can point at a local mock. */
  PHILSMS_API_BASE: z.url().default("https://dashboard.philsms.com/api/v3"),
});

let cachedSms: z.infer<typeof smsSchema> | null = null;

/** PhilSMS settings. Throws if SMS isn't configured; check smsConfigured() first. */
export function smsEnv() {
  if (!cachedSms) {
    cachedSms = smsSchema.parse({
      PHILSMS_API_TOKEN: process.env.PHILSMS_API_TOKEN,
      PHILSMS_SENDER_ID: process.env.PHILSMS_SENDER_ID,
      PHILSMS_API_BASE: process.env.PHILSMS_API_BASE || undefined,
    });
  }
  return cachedSms;
}

export const smsConfigured = () =>
  smsSchema.safeParse({ PHILSMS_API_TOKEN: process.env.PHILSMS_API_TOKEN, PHILSMS_SENDER_ID: process.env.PHILSMS_SENDER_ID }).success;
