import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Anonymous client for public directory data, such as active firms and their attorneys.
 * It carries no session, so RLS treats it as a signed-out visitor and pages using it
 * don't depend on the request's cookies.
 */
export function createPublicClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
