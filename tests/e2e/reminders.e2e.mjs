// Reminders and texts through the worker route, against the mock Resend and PhilSMS servers:
// which bookings get reminded and how, no double sends, reschedules, the monthly text cap,
// and retries that don't use up the cap. Run through tests/e2e/run.sh.
import { createClient } from "@supabase/supabase-js";
import { sentEmails, to } from "./mail.mjs";

const BASE = "http://localhost:3100";
const SMS = "http://localhost:4030";
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
const runWorker = async () => {
  const res = await fetch(`${BASE}/api/cron/send-notifications`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  return res.status === 200 ? res.json() : { status: res.status };
};
const texts = async () => (await fetch(`${SMS}/_sms`)).json();
const failNextTexts = (count, status = 500) => fetch(`${SMS}/_fail?count=${count}&status=${status}`, { method: "POST" });
const textsTo = async (phone) => (await texts()).filter((t) => t.to === phone);
const emailsTo = async (address, subject) => (await sentEmails()).filter(to(address, subject));

const HOUR = 3_600_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();

// A firm with one attorney, a manager and two clients: Rosa agrees to texts, Tomas doesn't.
const [firm] = await must(db.from("firms").insert({ slug: "remind-e2e", name: "Remind E2E Law", status: "active", contact_email: "desk@remind.test" }).select("id"));
const [attorney] = await must(db.from("attorneys").insert({ firm_id: firm.id, slug: "rhea-remind", full_name: "Rhea Remind", ibp_checked_at: new Date().toISOString() }).select("id"));
const [attorney2] = await must(db.from("attorneys").insert({ firm_id: firm.id, slug: "otto-other", full_name: "Otto Other", ibp_checked_at: new Date().toISOString() }).select("id"));
const [consult] = await must(db.from("consult_types").insert({ firm_id: firm.id, slug: "phone", label: "Phone Consultation", mode: "phone", duration_minutes: 30 }).select("id"));
const user = async (email) => (await db.auth.admin.createUser({ email, email_confirm: true })).data.user.id;
const manager = await user("manager@remind.test");
await must(db.from("firm_memberships").insert({ profile_id: manager, firm_id: firm.id, role: "partner" }));
const rosa = { id: await user("rosa@remind.test"), email: "rosa@remind.test", phone: "639170000001", optIn: true };
const tomas = { id: await user("tomas@remind.test"), email: "tomas@remind.test", phone: "639170000002", optIn: false };

/** A confirmed booking made days ago, starting `startsIn` ms from now. */
async function book(client, startsIn, { optIn = client.optIn, attorneyId = attorney.id } = {}) {
  const [a] = await must(
    db
      .from("appointments")
      .insert({
        firm_id: firm.id,
        attorney_id: attorneyId,
        consult_type_id: consult.id,
        client_id: client.id,
        status: "confirmed",
        review_status: "approved",
        starts_at: at(startsIn),
        ends_at: at(startsIn + HOUR / 2),
        created_at: at(-3 * 24 * HOUR),
      })
      .select("id"),
  );
  await must(
    db.from("intakes").insert({
      firm_id: firm.id,
      appointment_id: a.id,
      client_id: client.id,
      first_name: client.email.split("@")[0].replace(/^./, (c) => c.toUpperCase()),
      last_name: "Client",
      email: client.email,
      phone: client.phone,
      case_type: "Family",
      details: "Private details that must never appear in a reminder.",
      privacy_consent_at: new Date().toISOString(),
      sms_opt_in: optIn,
    }),
  );
  return a.id;
}
const logOf = (appointmentId) => must(db.from("notification_log").select("channel, template, status, error").eq("appointment_id", appointmentId));
const usage = async () => (await db.from("sms_usage").select("sent").eq("firm_id", firm.id).maybeSingle()).data?.sent ?? 0;

// Rows other suites left behind shouldn't skew anything below.
await db.from("notification_log").update({ status: "sent" }).eq("status", "queued");
await db.rpc("claim_due_reminders", { p_limit: 200 });
await fetch(`${SMS}/_sms`, { method: "DELETE" });

// --- Who gets what -----------------------------------------------------------------------
const tomorrowRosa = await book(rosa, 23.5 * HOUR);
const tomorrowTomas = await book(tomas, 22 * HOUR);
const soonRosa = await book(rosa, 50 * 60_000);

const first = await runWorker();
check("the worker claims the due reminders", first.reminders === 3, JSON.stringify(first));

const dayEmail = (await emailsTo(rosa.email, /^Reminder: Phone Consultation (today|tomorrow) at/))[0];
check("Rosa gets the day-before reminder email", Boolean(dayEmail), (await sentEmails()).map((e) => e.subject).slice(-6).join(" | "));
check("the reminder email comes from the firm with its reply-to", dayEmail?.from === '"Remind E2E Law" <notifications@e2e.test>' && dayEmail?.reply_to === "desk@remind.test");
check("the reminder email holds no case details", dayEmail && !dayEmail.text.includes("Private details") && !dayEmail.html.includes("Private details"));
check("Rosa gets the hour-before reminder email", (await emailsTo(rosa.email, /^Starting soon: Phone Consultation/)).length === 1);
check("Tomas gets his day-before reminder email", (await emailsTo(tomas.email, /^Reminder:/)).length === 1);

const rosaTexts = await textsTo(rosa.phone);
check("Rosa, who agreed to texts, gets two texts", rosaTexts.length === 2, JSON.stringify(rosaTexts));
const dayText = rosaTexts.find((t) => t.message.includes("Reminder of"));
check(
  "the day-before text names the firm and attorney under our sender ID",
  dayText?.sender_id === "E2ELaw" && dayText?.type === "plain" && dayText?.message.startsWith("Remind E2E Law: Reminder of your consultation with Rhea Remind "),
  dayText?.message,
);
check("texts hold no case details", rosaTexts.every((t) => !t.message.includes("Private") && !t.message.includes("Family")));
check("Tomas, who didn't agree to texts, gets none", (await textsTo(tomas.phone)).length === 0);
check("each text counts toward the firm's month", (await usage()) === 2, String(await usage()));
const rows = await logOf(tomorrowRosa);
check("sent texts are logged", rows.some((r) => r.channel === "sms" && r.template === "sms_reminder_24h" && r.status === "sent"), JSON.stringify(rows));

const again = await runWorker();
check("nothing is reminded twice", again.reminders === 0 && (await textsTo(rosa.phone)).length === 2 && (await emailsTo(rosa.email, /^Reminder:/)).length === 1, JSON.stringify(again));

// --- Reschedules and stale reminders ------------------------------------------------------
await must(db.from("appointments").update({ starts_at: at(23.8 * HOUR), ends_at: at(24.3 * HOUR) }).eq("id", tomorrowRosa));
const moved = await runWorker();
check("a rescheduled booking is reminded of its new time", moved.reminders === 1 && (await emailsTo(rosa.email, /^Reminder:/)).length === 2, JSON.stringify(moved));
check("and gets a text for the new time", (await textsTo(rosa.phone)).length === 3);

const [{ payload }] = await must(db.from("notification_log").select("payload").eq("appointment_id", tomorrowTomas).eq("template", "reminder_24h"));
const [stale] = await must(
  db
    .from("notification_log")
    .insert({ firm_id: firm.id, channel: "email", template: "reminder_24h", recipient: tomas.email, appointment_id: tomorrowTomas, payload: { ...payload, startsAt: at(30 * HOUR) }, dedupe_key: "e2e-stale-reminder" })
    .select("id"),
);
await must(db.from("appointments").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", soonRosa));
const [canceledText] = await must(
  db
    .from("notification_log")
    .insert({ firm_id: firm.id, channel: "sms", template: "sms_reminder_1h", recipient: rosa.phone, appointment_id: soonRosa, payload: { ...payload, startsAt: at(50 * 60_000) }, dedupe_key: "e2e-canceled-text" })
    .select("id"),
);
await runWorker();
const staleRow = await must(db.from("notification_log").select("status, error").eq("id", stale.id).single());
check("a reminder for an old time isn't sent", staleRow.status === "failed" && staleRow.error.includes("moved"), JSON.stringify(staleRow));
const canceledRow = await must(db.from("notification_log").select("status, error").eq("id", canceledText.id).single());
check("a reminder for a canceled booking isn't sent", canceledRow.status === "failed" && canceledRow.error.includes("no longer confirmed"), JSON.stringify(canceledRow));
check("and it uses none of the month's texts", (await usage()) === 3);

// --- The monthly cap ----------------------------------------------------------------------
await must(db.from("firms").update({ sms_monthly_cap: 3 }).eq("id", firm.id));
const tomasOptedIn = { ...tomas, optIn: true };
const overCapA = await book(tomasOptedIn, 23 * HOUR);
const overCapB = await book(tomasOptedIn, 21 * HOUR);
await runWorker();
check("over the cap, the client still gets the email", (await emailsTo(tomas.email, /^Reminder:/)).length === 3);
check("over the cap, no text goes out", (await textsTo(tomas.phone)).length === 0);
const capRows = [...(await logOf(overCapA)), ...(await logOf(overCapB))].filter((r) => r.channel === "sms");
check("texts over the cap are logged as skipped", capRows.length === 2 && capRows.every((r) => r.status === "failed" && r.error.includes("monthly text limit")), JSON.stringify(capRows));
check("the count stays at the cap", (await usage()) === 3);
await new Promise((r) => setTimeout(r, 1500));
const limitEmails = await emailsTo("manager@remind.test", /reached its text message limit/);
check("partners hear about the limit once a month", limitEmails.length === 1, String(limitEmails.length));

// --- Provider failures --------------------------------------------------------------------
await must(db.from("firms").update({ sms_monthly_cap: 10 }).eq("id", firm.id));
const retried = await book(rosa, 20.5 * HOUR, { attorneyId: attorney2.id });
await failNextTexts(1, 500);
await runWorker();
let [smsRow] = (await must(db.from("notification_log").select("id, status, attempts, error").eq("appointment_id", retried).eq("channel", "sms")));
check("a provider error is retried later", smsRow?.status === "queued" && smsRow.attempts === 1 && smsRow.error?.startsWith("500"), JSON.stringify(smsRow));
check("a text that didn't go out isn't counted", (await usage()) === 3, String(await usage()));
await must(db.from("notification_log").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", smsRow.id));
await runWorker();
[smsRow] = await must(db.from("notification_log").select("status, provider_message_id").eq("id", smsRow.id));
check("the retry is sent and counted once", smsRow.status === "sent" && Boolean(smsRow.provider_message_id) && (await usage()) === 4, JSON.stringify(smsRow));

const refused = await book(rosa, 20.2 * HOUR);
await failNextTexts(1, 422);
await runWorker();
const [refusedRow] = await must(db.from("notification_log").select("status, error").eq("appointment_id", refused).eq("channel", "sms"));
check("a refused text fails without a retry or a charge", refusedRow?.status === "failed" && (await usage()) === 4, JSON.stringify(refusedRow));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
