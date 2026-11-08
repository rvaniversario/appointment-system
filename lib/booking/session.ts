import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ties a visitor to the appointment they're booking. The cookie holds the appointment id
 * and a random token; the database holds only the token's hash. Each firm's pages get their
 * own cookie, scoped to /f/<firm>.
 */
const COOKIE = "booking";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newBookingToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export async function setBookingCookie(firmSlug: string, appointmentId: string, token: string): Promise<void> {
  (await cookies()).set(COOKIE, `${appointmentId}.${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/f/${firmSlug}`,
    maxAge: MAX_AGE_SECONDS,
  });
}

/** The appointment named by the cookie, if the token matches. Uses the service role. */
export async function getBookingFromCookie(firmId: string) {
  const raw = (await cookies()).get(COOKIE)?.value;
  const [appointmentId, token] = raw?.split(".") ?? [];
  if (!appointmentId || !token || !/^[0-9a-f-]{36}$/.test(appointmentId)) return null;

  const { data } = await createAdminClient()
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (!data?.booking_token_hash) return null;

  const expected = Buffer.from(data.booking_token_hash, "hex");
  const actual = Buffer.from(hashToken(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return data;
}

export type BookingRow = NonNullable<Awaited<ReturnType<typeof getBookingFromCookie>>>;

/** A hold the visitor can still work on, including one waiting for payment. */
export function isLiveHold(booking: BookingRow, now = new Date()): boolean {
  return (
    (booking.status === "held" || booking.status === "pending_payment") &&
    !!booking.hold_expires_at &&
    new Date(booking.hold_expires_at) > now
  );
}
