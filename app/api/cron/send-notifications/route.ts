import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron";
import { emailConfigured, smsConfigured } from "@/lib/env.server";
import { queueDueReminders } from "@/lib/notify/events";
import { processQueue } from "@/lib/notify/queue";

/** Up to this many batches per call, so one run can't outlast the function's time limit. */
const MAX_BATCHES = 5;

/**
 * Queues reminders that just came due, then sends queued notifications that are due,
 * including retries. pg_cron calls it every five minutes through pg_net (see
 * supabase/migrations/20261118000000_notifications.sql and 20261122000000_sms_reminders.sql);
 * any other scheduler can call it with "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 });
  if (!emailConfigured() && !smsConfigured()) return NextResponse.json({ skipped: "email and SMS not configured" });

  const reminders = await queueDueReminders();
  const totals = { reminders, sent: 0, retrying: 0, failed: 0 };
  for (let i = 0; i < MAX_BATCHES; i++) {
    const batch = await processQueue(20);
    totals.sent += batch.sent;
    totals.retrying += batch.retrying;
    totals.failed += batch.failed;
    if (batch.sent + batch.retrying + batch.failed < 20) break;
  }
  return NextResponse.json(totals);
}
