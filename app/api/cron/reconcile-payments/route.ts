import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronSecret, paymentsConfigured } from "@/lib/env.server";
import { syncPendingPayment } from "@/lib/payments/settle";

/** Leave very recent checkouts to the webhook. */
const MIN_AGE_MINUTES = 2;
const BATCH = 100;

function authorized(request: NextRequest): boolean {
  const secret = cronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Settles payments whose webhook never arrived and releases unpaid checkouts. PayMongo
 * doesn't resend missed webhooks, so this runs on a schedule. Any scheduler can call it
 * with "Authorization: Bearer $CRON_SECRET" (Vercel Cron sends that header itself).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });
  if (!paymentsConfigured()) return NextResponse.json({ skipped: "payments not configured" });

  const { data: pending } = await createAdminClient()
    .from("payments")
    .select("id")
    .eq("status", "pending")
    .not("provider_checkout_id", "is", null)
    .lt("created_at", new Date(Date.now() - MIN_AGE_MINUTES * 60_000).toISOString())
    .order("created_at")
    .limit(BATCH);

  const outcomes: Record<string, number> = {};
  for (const p of pending ?? []) {
    try {
      const outcome = await syncPendingPayment(p.id);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch (error) {
      outcomes.error = (outcomes.error ?? 0) + 1;
      console.error("[payments] reconcile failed", { paymentId: p.id, message: (error as Error).message });
    }
  }
  return NextResponse.json({ checked: pending?.length ?? 0, outcomes });
}
