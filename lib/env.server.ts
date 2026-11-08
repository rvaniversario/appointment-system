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

/** Shared secret that scheduled jobs send as "Authorization: Bearer <secret>". */
export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET;
  return value && value.length >= 32 ? value : null;
}
