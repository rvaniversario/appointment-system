// The client portal on real data, in a real browser: sign-in by emailed code, appointments
// (reschedule, cancel, cutoff), messages, documents and settings.
// Run through tests/e2e/run.sh, which prepares the database, servers and accounts.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { to, waitForEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
const MAILPIT = "http://127.0.0.1:54324";
const EMAIL = "portal@client.test";
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

// --- Fixture: a firm with one attorney, and a client with bookings in several states
const manilaDay = (daysAhead) => new Date(Date.now() + 8 * 3_600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
const at = (daysAhead, hhmm) => new Date(`${manilaDay(daysAhead)}T${hhmm}:00+08:00`).toISOString();
const plus = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const { user: client } = (await db.auth.admin.createUser({ email: EMAIL, email_confirm: true })).data;
const { user: other } = (await db.auth.admin.createUser({ email: "other@client.test", email_confirm: true })).data;
const { user: attorneyUser } = (await db.auth.admin.createUser({ email: "atty@portal.test", email_confirm: true })).data;
await must(db.from("profiles").update({ first_name: "Rosa", last_name: "Reyes" }).eq("id", client.id));

const [firm] = await must(db.from("firms").insert({ slug: "portal-e2e", name: "Portal E2E Law", status: "active" }).select("id"));
await must(db.from("firm_memberships").insert({ profile_id: attorneyUser.id, firm_id: firm.id, role: "attorney" }));
const [attorney] = await must(
  db.from("attorneys").insert({ firm_id: firm.id, profile_id: attorneyUser.id, slug: "pat", full_name: "Pat Santos" }).select("id"),
);
await must(
  db.from("availability_rules").insert(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ attorney_id: attorney.id, weekday, start_time: "09:00", end_time: "17:00" })),
  ),
);
const [call] = await must(
  db.from("consult_types").insert({ firm_id: firm.id, slug: "call", label: "Phone Consultation", mode: "phone", duration_minutes: 30 }).select("id"),
);

const appointment = (fields) => ({
  firm_id: firm.id,
  attorney_id: attorney.id,
  consult_type_id: call.id,
  client_id: client.id,
  price_centavos: 0,
  hold_expires_at: null,
  ...fields,
});
const soonStart = new Date(Math.ceil((Date.now() + 10 * 3_600_000) / 1_800_000) * 1_800_000).toISOString();
const rows = await must(
  db
    .from("appointments")
    .insert([
      appointment({ starts_at: at(4, "10:00"), ends_at: at(4, "10:30"), status: "confirmed" }),
      appointment({ starts_at: at(5, "10:00"), ends_at: at(5, "10:30"), status: "confirmed", price_centavos: 100000 }),
      appointment({ starts_at: soonStart, ends_at: plus(soonStart, 30), status: "confirmed" }),
      // An abandoned hold, and someone else's booking: neither may show.
      appointment({ starts_at: at(6, "10:00"), ends_at: at(6, "10:30"), status: "held", hold_expires_at: plus(new Date().toISOString(), -60) }),
      appointment({ starts_at: at(7, "10:00"), ends_at: at(7, "10:30"), status: "confirmed", client_id: other.id }),
    ])
    .select("id"),
);
const [movable, paid, soon] = rows;
await must(db.from("payments").insert({ firm_id: firm.id, client_id: client.id, appointment_id: paid.id, amount_centavos: 100000, status: "paid" }));
await must(
  db.from("invoices").insert({
    firm_id: firm.id,
    client_id: client.id,
    appointment_id: paid.id,
    description: "Phone Consultation",
    amount_centavos: 100000,
    status: "paid",
    paid_at: new Date().toISOString(),
  }),
);
const [thread] = await must(
  db.from("message_threads").insert({ firm_id: firm.id, client_id: client.id, attorney_id: attorney.id }).select("id"),
);
const [attorneyMessage] = await must(
  db.from("messages").insert({ thread_id: thread.id, sender_id: attorneyUser.id, body: "Please bring your lease." }).select("id"),
);

// --- Sign in with the code from the local mail catcher
async function signIn(page) {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await page.goto(`${BASE}/portal/login`);
  await page.fill("#portal-email", EMAIL);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.waitForURL("**/portal/verify", { timeout: 15000 });
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) code = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text?.match(/\b(\d{6})\b/)?.[1] ?? null;
    if (!code) await new Promise((r) => setTimeout(r, 500));
  }
  if (!code) throw new Error("no sign-in code arrived");
  await page.fill("#otp-code", code);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/portal/appointments", { timeout: 15000 });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await signIn(page);
check("client signs in with an emailed code", path(page) === "/portal/appointments", path(page));

// --- Appointments
const cards = page.getByTestId("portal-appointment");
check("lists only the client's real bookings", (await cards.count()) === 3, String(await cards.count()));
check("labels each booking with its firm", (await cards.first().getByText("Portal E2E Law", { exact: true }).count()) === 1);
const soonCard = cards.filter({ hasText: /Online changes close 24 hours/ });
check("inside the cutoff, online changes are closed", (await soonCard.count()) === 1);
check("inside the cutoff, there is no cancel button", (await soonCard.getByRole("button", { name: "Cancel" }).count()) === 0);

{
  const card = cards.filter({ hasText: manilaLabel(at(4, "10:00")) });
  await card.getByRole("button", { name: "Reschedule" }).click();
  const day = card.locator('button[aria-label*="open time"]:not([disabled])').nth(2);
  await day.waitFor();
  await day.click();
  const time = card.locator("button", { hasText: /^\d{1,2}:\d{2} (AM|PM)$/ }).first();
  await time.click();
  const confirm = card.getByRole("button", { name: "Confirm new time" });
  await confirm.click();
  // Once the new time is saved, no card shows the old one.
  await cards.filter({ hasText: manilaLabel(at(4, "10:00")) }).waitFor({ state: "detached", timeout: 10000 });
  check("the old time is gone from the list", (await cards.filter({ hasText: manilaLabel(at(4, "10:00")) }).count()) === 0);
  const moved = await must(db.from("appointments").select("starts_at, ends_at, status").eq("id", movable.id).single());
  check("reschedule moves the booking", Date.parse(moved.starts_at) !== Date.parse(at(4, "10:00")) && moved.status === "confirmed", moved.starts_at);
  check("reschedule keeps the length", new Date(moved.ends_at) - new Date(moved.starts_at) === 30 * 60_000);
  const audits = await must(db.from("audit_log").select("action").eq("entity_id", movable.id));
  check("reschedule is audited", audits.some((a) => a.action === "appointment.rescheduled_by_client"));
  const moveEmail = await waitForEmail(to(EMAIL, /^Rescheduled: /));
  check("the client is emailed the new time with an updated calendar file", Boolean(moveEmail?.attachments[0]?.content.includes("METHOD:PUBLISH")));
  check("the attorney is told the client rescheduled", Boolean(await waitForEmail(to("atty@portal.test", /^Rescheduled by client: Rosa Reyes/))));
}

{
  const card = page.getByTestId("portal-appointment").filter({ hasText: manilaLabel(at(5, "10:00")) });
  await card.getByRole("button", { name: "Cancel" }).click();
  check("canceling a paid booking says it's flagged for refund", (await card.getByText(/flagged to Portal E2E Law for a refund/).count()) === 1);
  await card.getByRole("button", { name: "Yes, cancel it" }).click();
  await page.getByRole("heading", { name: "Past and canceled" }).waitFor({ timeout: 10000 });
  const row = await must(db.from("appointments").select("status, cancel_reason").eq("id", paid.id).single());
  check("cancel releases the booking", row.status === "canceled" && row.cancel_reason === "canceled by client", JSON.stringify(row));
  const payment = await must(db.from("payments").select("status").eq("appointment_id", paid.id).single());
  check("the payment stays paid, for the firm to refund", payment.status === "paid");
  check("canceled booking shows as canceled", (await page.getByTestId("portal-appointment").filter({ hasText: "Canceled" }).count()) === 1);
  const cancelEmail = await waitForEmail(to(EMAIL, /^Canceled: /));
  check("the client is emailed a cancellation that mentions the refund", Boolean(cancelEmail?.text.includes("will refund the fee")));
  check("with a calendar cancellation", Boolean(cancelEmail?.attachments[0]?.content.includes("METHOD:CANCEL")));
  check("the attorney is told the client canceled", Boolean(await waitForEmail(to("atty@portal.test", /^Canceled by client: Rosa Reyes/))));
}
const soonRow = await must(db.from("appointments").select("status").eq("id", soon.id).single());
check("the booking inside the cutoff is untouched", soonRow.status === "confirmed");

// --- Messages
await page.goto(`${BASE}/portal/messages`);
check("shows the attorney's message", await page.getByText("Please bring your lease.").isVisible());
await page.getByLabel("Message").fill("Will do, thank you.");
await page.getByRole("button", { name: "Send" }).click();
// The box empties once the message is saved.
await page.waitForFunction(() => document.querySelector("textarea")?.value === "", null, { timeout: 10000 });
await page.locator("div", { hasText: /^Will do, thank you.$/ }).first().waitFor({ timeout: 10000 });
const sent = await must(db.from("messages").select("sender_id").eq("thread_id", thread.id).eq("body", "Will do, thank you."));
check("the message is saved as the client's", sent.length === 1 && sent[0].sender_id === client.id);
const messageAlert = await waitForEmail(to("atty@portal.test", /^New message from Rosa Reyes/));
check("the attorney is emailed about the message", Boolean(messageAlert));
check("the alert doesn't include the message", Boolean(messageAlert && !messageAlert.text.includes("Will do")));
let readAt = null;
for (let i = 0; i < 10 && !readAt; i++) {
  readAt = (await must(db.from("messages").select("read_at").eq("id", attorneyMessage.id).single())).read_at;
  if (!readAt) await new Promise((r) => setTimeout(r, 300));
}
check("opening the thread marks the attorney's message read", Boolean(readAt));

// --- Documents
const pdf = join(tmpdir(), "lease.pdf");
writeFileSync(pdf, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
await page.goto(`${BASE}/portal/documents`);
check("documents are shared with the client's firm", await page.getByText("Shared with Portal E2E Law.").isVisible());
await page.setInputFiles('input[type="file"]', pdf);
await page.getByText("lease.pdf").waitFor({ timeout: 15000 });
const docs = await must(db.from("documents").select("firm_id, storage_path, appointment_id").eq("owner_id", client.id));
check("the upload is recorded for the firm", docs.length === 1 && docs[0].firm_id === firm.id && docs[0].storage_path.startsWith(`${firm.id}/${client.id}/`));
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), page.getByRole("button", { name: "Download" }).click()]);
check("the document downloads under its own name", download.suggestedFilename() === "lease.pdf", download.suggestedFilename());
await page.setInputFiles('input[type="file"]', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
await page.getByText(/notes\.txt: Upload a PDF/).waitFor({ timeout: 10000 });
check("other file types are refused", true);

// --- Settings
await page.goto(`${BASE}/portal/settings`);
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: "Save changes" }).click();
await page.getByText("Your changes have been saved.").waitFor({ timeout: 10000 });
const profile = await must(db.from("profiles").select("sms_opt_in").eq("id", client.id).single());
check("the client can opt in to SMS", profile.sms_opt_in === true);
await page.getByRole("button", { name: "Billing & invoices" }).click();
check("invoices show with the firm and amount", await page.getByText("Portal E2E Law ·").first().isVisible() && (await page.getByText("₱1,000").count()) === 1);

// --- Changing the sign-in email: a link to each address, and both must be opened
const NEW_EMAIL = "portal.new@client.test";
/** The confirm link in the latest email-change message to an address, pointed at this server. */
async function changeLink(address) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address} subject:"Confirm your new sign-in email"`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const html = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).HTML ?? "";
      const href = html.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (href) {
        const url = new URL(href.replaceAll("&amp;", "&"));
        return `${BASE}${url.pathname}${url.search}`;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
async function requestChange(address) {
  await page.goto(`${BASE}/portal/settings`);
  await page.getByRole("button", { name: /Change email|Use a different new email/ }).click();
  await page.fill("#new-email", address);
  await page.getByRole("button", { name: "Send confirmation links" }).click();
  await page.getByText(`To change your email to ${address}`).waitFor({ timeout: 10000 });
}

await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
await requestChange("other@client.test");
check("an address that has an account gets the same answer", true);
await new Promise((r) => setTimeout(r, 1500));
const toOther = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:other@client.test")}`)).json();
check("an address that has an account is sent nothing", (toOther.messages ?? []).length === 0);

// Supabase allows one email change request a minute per account.
await new Promise((r) => setTimeout(r, 61_000));
await requestChange(NEW_EMAIL);
await page.reload();
check("the pending change survives a reload", await page.getByText(`To change your email to ${NEW_EMAIL}`).isVisible());
const newLink = await changeLink(NEW_EMAIL);
const oldLink = await changeLink(EMAIL);
check("both addresses get a confirmation link", Boolean(newLink && oldLink));
const stillOld = await must(db.from("profiles").select("email").eq("id", client.id).single());
check("the email doesn't change before the links are opened", stillOld.email === EMAIL, stillOld.email);

const visitor = await browser.newContext();
const visitorPage = await visitor.newPage();
await visitorPage.goto(newLink);
check("opening one link asks for the other", await visitorPage.getByText("One more link to open").isVisible(), visitorPage.url());
const afterOne = await must(db.from("profiles").select("email").eq("id", client.id).single());
check("one link alone changes nothing", afterOne.email === EMAIL, afterOne.email);
await visitorPage.goto(oldLink);
check("opening both links changes the email", await visitorPage.getByText("Your email has been changed").isVisible(), visitorPage.url());
const changed = await must(db.from("profiles").select("email").eq("id", client.id).single());
check("the profile now has the new email", changed.email === NEW_EMAIL, changed.email);
await visitorPage.goto(oldLink);
check("a used link says it didn't work", await visitorPage.getByText("That link didn't work").isVisible());
await visitor.close();

check("no browser errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);

/** "Wed, Nov 11 · 10:00 AM", matching the portal's own label. */
function manilaLabel(iso) {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  const h = d.getUTCHours();
  return `${dow}, ${mon} ${d.getUTCDate()} · ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
