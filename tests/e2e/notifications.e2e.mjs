// The email worker route against the mock Resend server: auth, retries with backoff, stale and
// unknown rows, and no double sends. Run through tests/e2e/run.sh.
import { createClient } from "@supabase/supabase-js";
import { failNextSends, sentEmails, to, waitForEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
};
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};
const runWorker = async (secret = process.env.CRON_SECRET) => {
  const res = await fetch(`${BASE}/api/cron/send-notifications`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};
const row = (id) => must(db.from("notification_log").select("*").eq("id", id).single());

const [firm] = await must(db.from("firms").insert({ slug: "notify-e2e", name: "Notify E2E Law", status: "active", contact_email: "desk@notify.test" }).select("id"));
const payload = {
  appointmentId: "00000000-0000-4000-8000-000000000000",
  consultLabel: "Phone Consultation",
  attorneyName: "Nora Notify",
  startsAt: "2030-01-15T02:00:00Z",
  endsAt: "2030-01-15T02:30:00Z",
  mode: "phone",
  where: null,
  clientName: "Ciro",
};
const queue = async (fields) =>
  (await must(db.from("notification_log").insert({ firm_id: firm.id, channel: "email", template: "booking_approved", recipient: "ciro@notify.test", payload, ...fields }).select("id")))[0];

// Rows other suites left behind shouldn't skew the counts below.
await db.from("notification_log").update({ status: "sent" }).eq("status", "queued").neq("firm_id", firm.id);

check("the worker needs the cron secret", (await runWorker(null)).status === 401);
check("a wrong secret is refused", (await runWorker("x".repeat(46))).status === 401);

// A provider failure is retried later, not lost.
const retried = await queue({ dedupe_key: "e2e-retry" });
await failNextSends(1);
const first = await runWorker();
check("a failed send is scheduled for a retry", first.body?.retrying === 1 && first.body?.sent === 0, JSON.stringify(first.body));
let r = await row(retried.id);
check("the row stays queued with the error and a later attempt time", r.status === "queued" && r.attempts === 1 && r.error?.startsWith("500") && new Date(r.next_attempt_at) > new Date(), JSON.stringify(r));
check("a retry isn't attempted before it's due", (await runWorker()).body?.sent === 0);
await must(db.from("notification_log").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", retried.id));
const second = await runWorker();
check("the retry is sent once due", second.body?.sent === 1, JSON.stringify(second.body));
r = await row(retried.id);
check("the row is marked sent with the provider's id", r.status === "sent" && r.attempts === 2 && Boolean(r.provider_message_id) && r.error === null, JSON.stringify(r));
const email = await waitForEmail(to("ciro@notify.test", /accepted your consultation/));
check("the email went out from the firm, with the firm's reply-to", email?.from === '"Notify E2E Law" <notifications@e2e.test>' && email?.reply_to === "desk@notify.test", `${email?.from} ${email?.reply_to}`);
await runWorker();
check("a sent row is never sent again", (await sentEmails()).filter((e) => e.to.includes("ciro@notify.test")).length === 1);

// Stale and unknown rows fail instead of going out late or wrong.
const stale = await queue({ dedupe_key: "e2e-stale", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() });
const unknown = await queue({ dedupe_key: "e2e-unknown", template: "no_such_template" });
const third = await runWorker();
check("stale and unknown rows are failed", third.body?.failed === 2, JSON.stringify(third.body));
check("a stale row isn't sent a day late", (await row(stale.id)).error?.includes("24 hours"));
check("an unknown template is failed", (await row(unknown.id)).error?.includes("unknown template"));

// The same event can't be queued twice.
const dup = await db.from("notification_log").insert({ firm_id: firm.id, channel: "email", template: "booking_approved", recipient: "ciro@notify.test", payload, dedupe_key: "e2e-retry" });
check("a duplicate dedupe key is rejected", dup.error?.code === "23505", dup.error?.code);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
