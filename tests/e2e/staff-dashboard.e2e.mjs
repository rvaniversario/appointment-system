// The staff dashboard on real data, in a real browser: an attorney and a partner each sign in
// with MFA, then review bookings, record outcomes, message a client, manage hours and conflicts.
// Run through tests/e2e/run.sh, which prepares the database and servers.
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { sentEmails, to, waitForEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
const PASSWORD = "Staff-Pass-123456";
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
};
const path = (page) => new URL(page.url()).pathname;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const must = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};
/** Waits until a database read satisfies a condition, since actions finish after the click. */
async function eventually(read, ok, tries = 30) {
  let value;
  for (let i = 0; i < tries; i++) {
    value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 300));
  }
  return value;
}

// --- TOTP for MFA enrollment
const b32 = (s) => {
  let b = "";
  for (const c of s.replace(/=+$/, "")) b += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from(b.match(/.{8}/g).map((x) => parseInt(x, 2)));
};
const totp = (s) => {
  const t = Buffer.alloc(8);
  t.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", b32(s)).update(t).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
};

// --- Fixture: a firm with two attorneys and a partner, a client, and bookings to work on
const user = async (email, fields = {}) => {
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(error.message);
  await must(db.from("profiles").update(fields).eq("id", data.user.id));
  return data.user;
};
const one = await user("one@dash.test", { first_name: "Olivia", last_name: "One" });
const two = await user("two@dash.test", { first_name: "Tomas", last_name: "Two" });
const partner = await user("partner@dash.test", { first_name: "Paz", last_name: "Partner" });
const client = await user("client@dash.test", { first_name: "Carla", last_name: "Client" });

const [firm] = await must(db.from("firms").insert({ slug: "dash-e2e", name: "Dash E2E Law", status: "active" }).select("id"));
await must(
  db.from("firm_memberships").insert([
    { profile_id: one.id, firm_id: firm.id, role: "attorney" },
    { profile_id: two.id, firm_id: firm.id, role: "attorney" },
    { profile_id: partner.id, firm_id: firm.id, role: "partner" },
  ]),
);
const [attOne, attTwo] = await must(
  db
    .from("attorneys")
    .insert([
      { firm_id: firm.id, profile_id: one.id, slug: "olivia-one", full_name: "Olivia One", meeting_url: "https://meet.example/one", practice_areas: ["Family Law"] },
      { firm_id: firm.id, profile_id: two.id, slug: "tomas-two", full_name: "Tomas Two", meeting_url: "https://meet.example/two", practice_areas: ["Family Law"] },
    ])
    .select("id"),
);
const [video] = await must(
  db.from("consult_types").insert({ firm_id: firm.id, slug: "video", label: "Video Consultation", mode: "video", duration_minutes: 30 }).select("id"),
);
await must(db.from("conflict_parties").insert({ firm_id: firm.id, name: "Amara Smith", matter: "Smith v. Holdings", attorney_id: attTwo.id }));

// Next week, Manila time.
const manilaToday = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const dow = new Date(`${manilaToday}T00:00:00Z`).getUTCDay();
const nextMonday = new Date(Date.parse(`${manilaToday}T00:00:00Z`) + (((8 - dow) % 7) || 7) * 86_400_000).toISOString().slice(0, 10);
const at = (offsetDays, hhmm) => new Date(Date.parse(`${nextMonday}T${hhmm}:00+08:00`) + offsetDays * 86_400_000).toISOString();
const plus30 = (iso) => new Date(Date.parse(iso) + 30 * 60_000).toISOString();
const appt = (fields) => ({
  firm_id: firm.id,
  attorney_id: attOne.id,
  client_id: client.id,
  consult_type_id: video.id,
  status: "confirmed",
  price_centavos: 0,
  review_status: "pending",
  meeting_url: "https://meet.example/one",
  ...fields,
});
const yesterday = new Date(Date.now() - 26 * 3_600_000);
yesterday.setUTCMinutes(0, 0, 0);
const [conflicted, toDecline, toReassign, past] = await must(
  db
    .from("appointments")
    .insert([
      appt({ starts_at: at(1, "10:00"), ends_at: plus30(at(1, "10:00")) }),
      appt({ starts_at: at(2, "10:00"), ends_at: plus30(at(2, "10:00")), price_centavos: 100000 }),
      appt({ starts_at: at(3, "10:00"), ends_at: plus30(at(3, "10:00")) }),
      appt({ starts_at: yesterday.toISOString(), ends_at: plus30(yesterday.toISOString()), review_status: "approved" }),
    ])
    .select("id"),
);
const intake = (appointmentId, opposing = "") => ({
  firm_id: firm.id,
  appointment_id: appointmentId,
  client_id: client.id,
  first_name: "Carla",
  last_name: "Client",
  email: "client@dash.test",
  phone: "639171234567",
  case_type: "Family Law",
  details: "Custody question.",
  opposing_party: opposing,
  privacy_consent_at: new Date().toISOString(),
});
await must(db.from("intakes").insert([intake(conflicted.id, "Amara Smyth"), intake(toDecline.id), intake(toReassign.id), intake(past.id)]));
await must(db.rpc("run_conflict_check", { p_appointment: conflicted.id }));
await must(db.from("payments").insert({ firm_id: firm.id, client_id: client.id, appointment_id: toDecline.id, amount_centavos: 100000, status: "paid" }));
const [thread] = await must(db.from("message_threads").insert({ firm_id: firm.id, client_id: client.id, attorney_id: attOne.id }).select("id"));
const [clientMessage] = await must(
  db.from("messages").insert({ thread_id: thread.id, sender_id: client.id, body: "Can I bring my sister?" }).select("id"),
);

// --- Browser helpers
const browser = await chromium.launch();
async function signIn(email) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/staff/login`);
  await page.fill("#staff-email", email);
  await page.fill("#staff-password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/mfa-setup", { timeout: 15000 });
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor({ timeout: 15000 });
  await page.fill('input[placeholder="123456"]', totp((await secretEl.innerText()).trim()));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/calendar", { timeout: 15000 });
  return { ctx, page, errors };
}
const row = (table, id, columns) => must(db.from(table).select(columns).eq("id", id).single());

// =========================================================================
// Attorney
// =========================================================================
{
  const { ctx, page, errors } = await signIn("one@dash.test");

  await page.goto(`${BASE}/staff/calendar?week=${nextMonday}`);
  const entries = page.getByTestId("calendar-entry");
  check("attorney's calendar shows their bookings", (await entries.count()) === 3, String(await entries.count()));
  check("attorney's calendar has only their own row", (await page.getByText("Tomas Two").count()) === 0);
  check("billing isn't in the attorney's menu", (await page.getByRole("link", { name: "Billing" }).count()) === 0);
  await page.goto(`${BASE}/staff/billing`);
  check("billing is blocked for attorneys", path(page) === "/staff/calendar", path(page));

  await page.goto(`${BASE}/staff/queue`);
  const items = page.getByTestId("queue-item");
  check("the queue lists the three bookings to review", (await items.count()) === 3, String(await items.count()));
  const flagged = items.filter({ hasText: "1 possible conflict" });
  check("a possible conflict is flagged in the queue", (await flagged.count()) === 1);
  check("a flagged booking can't be approved from the list", (await flagged.getByRole("button", { name: "Approve" }).count()) === 0);

  await flagged.getByRole("link", { name: "Review" }).click();
  await page.waitForURL(`**/staff/appointments/${conflicted.id}`);
  check("the detail page explains the conflict match", await page.getByText(/resembles Amara Smith/).isVisible());
  check("the detail page shows the intake", await page.getByText("Custody question.").isVisible());
  check("attorneys can't reassign", (await page.getByRole("combobox", { name: "Reassign to" }).count()) === 0);

  await page.getByLabel("Meeting link").fill("http://insecure.example");
  await page.getByRole("button", { name: "Save link" }).click();
  const refused = await page.getByText(/full https:\/\/ link/).waitFor({ timeout: 10000 }).then(() => true, () => false);
  const unchanged = await row("appointments", conflicted.id, "meeting_url");
  check("only https meeting links are accepted", refused && unchanged.meeting_url === "https://meet.example/one", unchanged.meeting_url);
  await page.getByLabel("Meeting link").fill("https://zoom.us/j/123");
  await page.getByRole("button", { name: "Save link" }).click();
  const linked = await eventually(() => row("appointments", conflicted.id, "meeting_url"), (r) => r.meeting_url === "https://zoom.us/j/123");
  check("the meeting link is saved", linked.meeting_url === "https://zoom.us/j/123");
  const linkEmail = await waitForEmail(to("client@dash.test", /^Meeting link for your consultation/));
  check("the client is emailed the new meeting link", Boolean(linkEmail?.text.includes("https://zoom.us/j/123")));

  const pdf = join(tmpdir(), "retainer.pdf");
  writeFileSync(pdf, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  await page.setInputFiles('input[type="file"]', pdf);
  await page.getByText("retainer.pdf").waitFor({ timeout: 15000 });
  const docs = await must(db.from("documents").select("owner_id, uploaded_by, firm_id").eq("appointment_id", conflicted.id));
  check("a document added by staff goes in the client's file", docs.length === 1 && docs[0].owner_id === client.id && docs[0].uploaded_by === one.id);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByRole("button", { name: "Download" }).click()]);
  check("staff can download the client's document", download.suggestedFilename() === "retainer.pdf", download.suggestedFilename());

  await page.getByRole("button", { name: "Approve" }).click();
  const approved = await eventually(() => row("appointments", conflicted.id, "review_status"), (r) => r.review_status === "approved");
  check("approving marks the booking approved", approved.review_status === "approved");
  const audits = await must(db.from("audit_log").select("action, actor_id").eq("entity_id", conflicted.id));
  check("approval is audited with the attorney as actor", audits.some((a) => a.action === "appointment.approved" && a.actor_id === one.id));
  check("the client is told the attorney accepted", Boolean(await waitForEmail(to("client@dash.test", /^Olivia One accepted your consultation/))));

  await page.goto(`${BASE}/staff/appointments/${past.id}`);
  await page.getByRole("button", { name: "Completed" }).click();
  const done = await eventually(() => row("appointments", past.id, "status"), (r) => r.status === "completed");
  check("an attorney records a consultation as completed", done.status === "completed");

  await page.goto(`${BASE}/staff/messages`);
  check("the client's message is in the inbox", await page.getByText("Can I bring my sister?").isVisible());
  await page.getByLabel("Message").fill("Yes, that's fine.");
  await page.getByRole("button", { name: "Send" }).click();
  const reply = await eventually(
    () => must(db.from("messages").select("sender_id").eq("thread_id", thread.id).eq("body", "Yes, that's fine.")),
    (r) => r.length === 1,
  );
  check("the reply is saved as the attorney's", reply.length === 1 && reply[0].sender_id === one.id);
  const read = await eventually(() => row("messages", clientMessage.id, "read_at"), (r) => Boolean(r.read_at));
  check("opening the conversation marks the client's message read", Boolean(read.read_at));
  const replyAlert = await waitForEmail(to("client@dash.test", /^New message from Olivia One/));
  check("the client is emailed about the reply, without its text", Boolean(replyAlert && !replyAlert.text.includes("that's fine")));

  await page.goto(`${BASE}/staff/availability`);
  const saturday = page.getByTestId("hours-Saturday");
  await saturday.getByRole("button", { name: "+ Add hours" }).click();
  await page.getByLabel("Saturday end").fill("12:00");
  await page.getByRole("button", { name: "Save weekly hours" }).click();
  await page.getByText("Weekly hours saved.").waitFor({ timeout: 10000 });
  const rules = await must(db.from("availability_rules").select("weekday, start_time, end_time").eq("attorney_id", attOne.id));
  check("an attorney saves their weekly hours", rules.length === 1 && rules[0].weekday === 6 && rules[0].end_time === "12:00:00", JSON.stringify(rules));
  await page.locator('input[type="date"]').first().fill(at(2, "00:00").slice(0, 10));
  await page.getByRole("button", { name: "Add time off" }).click();
  await page.getByText(/1 existing booking falls in this time/).waitFor({ timeout: 10000 });
  check("time off warns about bookings it overlaps", true);
  check("time off is listed", (await page.getByTestId("time-off").count()) === 1);

  await page.goto(`${BASE}/staff/conflicts?q=${encodeURIComponent("Amara Smyth")}`);
  check("conflict search tolerates misspellings", (await page.getByTestId("conflict-party").count()) === 1);
  check("attorneys can't add conflict records", (await page.getByRole("button", { name: "Add party" }).count()) === 0);

  await page.goto(`${BASE}/staff/analytics`);
  check("attorney analytics show stat cards", (await page.getByTestId("stat-card").count()) === 4);
  check("attorneys don't see fee totals", (await page.getByText("Fees collected online").count()) === 0);

  check("no browser errors for the attorney", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// =========================================================================
// Partner
// =========================================================================
{
  const { ctx, page, errors } = await signIn("partner@dash.test");

  await page.goto(`${BASE}/staff/calendar?week=${nextMonday}`);
  check("the firm calendar shows every attorney", (await page.getByText("Olivia One").count()) === 1 && (await page.getByText("Tomas Two").count()) === 1);

  await page.goto(`${BASE}/staff/appointments/${toReassign.id}`);
  await page.getByRole("combobox", { name: "Reassign to" }).selectOption({ label: "Tomas Two (practices this area)" });
  await page.getByRole("button", { name: "Reassign" }).click();
  const moved = await eventually(() => row("appointments", toReassign.id, "attorney_id, review_status, meeting_url"), (r) => r.attorney_id === attTwo.id);
  check("a partner reassigns a booking", moved.attorney_id === attTwo.id && moved.review_status === "approved", JSON.stringify(moved));
  check("the video link follows the new attorney", moved.meeting_url === "https://meet.example/two", moved.meeting_url);
  const movedEmail = await waitForEmail(to("client@dash.test", /^Your consultation is now with Tomas Two/));
  check("the client is emailed the new attorney and link", Boolean(movedEmail?.text.includes("https://meet.example/two")));
  check("the new attorney is told", Boolean(await waitForEmail(to("two@dash.test", /^Assigned to you: Carla/))));

  await page.goto(`${BASE}/staff/appointments/${toDecline.id}`);
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  check("declining a paid booking mentions the refund", await page.getByText(/refund due/).isVisible());
  await page.getByRole("textbox", { name: /Reason/ }).fill("Outside our practice");
  await page.getByRole("button", { name: "Decline booking" }).click();
  const declined = await eventually(() => row("appointments", toDecline.id, "status, review_status, cancel_reason"), (r) => r.status === "canceled");
  check("declining cancels the booking", declined.review_status === "declined" && declined.cancel_reason === "declined by firm", JSON.stringify(declined));
  const declineEmail = await waitForEmail((e) => e.to.includes("client@dash.test") && /^Canceled: /.test(e.subject));
  check("the client is told the firm can't take it, and about the refund", Boolean(declineEmail?.text.includes("isn't able to take it") && declineEmail.text.includes("will refund")));
  check("the decline reason stays internal", (await sentEmails()).every((e) => !e.text.includes("Outside our practice")));
  check("partners are told a refund is due", Boolean(await waitForEmail(to("partner@dash.test", /^Refund due: ₱1,000 to Carla/))));
  await page.goto(`${BASE}/staff/billing`);
  check("billing shows the declined fee as a refund due", await page.getByText("Paid, declined by firm — refund due").isVisible());
  check("billing shows fees by attorney", await page.getByText("Online fees by attorney").isVisible());

  await page.goto(`${BASE}/staff/conflicts`);
  await page.getByLabel("Party name").fill("Benito Ramos");
  await page.getByLabel("Matter", { exact: true }).fill("Ramos v. Ramos");
  await page.getByRole("button", { name: "Add party" }).click();
  await page.getByText("Benito Ramos — Ramos v. Ramos").waitFor({ timeout: 10000 });
  check("a partner adds a conflict record", true);
  await page.getByRole("button", { name: "Remove Benito Ramos" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await page.getByText("Benito Ramos — Ramos v. Ramos").waitFor({ state: "detached", timeout: 10000 });
  check("a partner removes a conflict record", true);

  await page.goto(`${BASE}/staff/analytics`);
  check("partner analytics include fees", await page.getByText("Fees collected online").isVisible());

  await page.goto(`${BASE}/staff/availability`);
  check("a partner can manage each attorney's hours", (await page.getByRole("navigation", { name: "Attorneys" }).getByRole("link").count()) === 2);

  check("no browser errors for the partner", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
