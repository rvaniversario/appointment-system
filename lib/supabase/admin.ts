import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Next.js memoizes identical GET fetches for a whole render, so a page that changes a booking
 * and then re-reads it would see the old row. Service-role reads are of state that changes
 * mid-request (holds, payments), so they opt out with their own AbortController signal.
 */
const unmemoizedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });

/**
 * Service-role client: BYPASSES Row Level Security. Use only in trusted server code
 * (admin user management, webhooks, scheduled jobs) and never with user-controlled
 * table/column names. Every use must authorize the caller first.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: unmemoizedFetch },
  });
}
