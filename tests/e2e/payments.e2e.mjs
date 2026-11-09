// Paid bookings against the mock PayMongo server: checkout, webhooks, retries, expiry, refunds.
// Run through tests/e2e/run.sh, which prepares the database, servers and accounts.
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { sentEmails, to, waitForEmail } from "./mail.mjs";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");
const db = createClient("http://127.0.0.1:54321", process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BASE = "http://localhost:3100";
const MOCK = "http://localhost:4010";
const FIRM = "harlow-reyes";
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
};
const path = (page) => new URL(page.url()).pathname;
const mockLog = async () => (await fetch(`${MOCK}/__log`)).json();

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

const browser = await chromium.launch();
const session = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
};

async function chooseTime(page, consultLabel, skip = 0) {
  await page.getByRole("button", { name: new RegExp(consultLabel) }).click();
  for (let week = 0; week < 3; week++) {
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label*=", "]').length > 0);
    const open = page.locator('button[aria-label]:not([aria-label*="no open times"])').filter({ hasText: /\d/ });
    if ((await open.count()) > 0) {
      await open.first().click();
      const times = page.locator("button", { hasText: /^\d{1,2}:\d{2} (AM|PM)$/ });
      await times.first().waitFor();
      const chosen = times.nth(skip);
      const label = await chosen.innerText();
      await chosen.click();
      return label;
    }
    await page.getByRole("button", { name: "Later →" }).click();
  }
  throw new Error("no open times");
}

/** Books a paid consultation up to the payment step. */
async function toPayment(page, attorney, email, skip = 0) {
  await page.goto(`${BASE}/f/${FIRM}/book/${attorney}/time`);
  const time = await chooseTime(page, "30-min Video Consultation", skip);
  await page.getByRole("button", { name: "Continue to intake form →" }).click();
  await page.waitForURL("**/intake");
  const field = (label) => page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea, label:has-text("${label}") + select`);
  await field("First name").fill("Paying");
  await field("Last name").fill("Client");
  await field("Email").fill(email);
  await field("Mobile number").fill("09171234567");
  await field("Case type").selectOption({ index: 1 });
  await field("Briefly describe your situation").fill("A question.");
  await page.getByText("I understand this consultation").click();
  await page.getByText("I consent to Harlow & Reyes").click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.waitForURL("**/documents");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByText("I have read and agree").click();
  await page.getByPlaceholder("Full legal name").fill("Paying Client");
  await page.getByRole("button", { name: "Sign and continue →" }).click();
  await page.waitForURL("**/payment");
  return time;
}

const latestPayment = async (email) => {
  const { data: intake } = await db.from("intakes").select("appointment_id").eq("email", email).order("created_at", { ascending: false }).limit(1).single();
  const { data } = await db.from("payments").select("*").eq("appointment_id", intake.appointment_id).order("created_at", { ascending: false });
  const { data: appt } = await db.from("appointments").select("status").eq("id", intake.appointment_id).single();
  return { payments: data, appointmentId: intake.appointment_id, appointmentStatus: appt.status };
};

// 1. Paid booking, confirmed by the webhook
{
  const { page, ctx, errors } = await session();
  await toPayment(page, "sofia-ramirez", "pay1@example.com");
  check("payment step offers secure checkout", await page.getByRole("button", { name: "Pay ₱1,500 securely" }).isVisible());
  await page.getByRole("button", { name: "Pay ₱1,500 securely" }).click();
  await page.waitForURL(`${MOCK}/pay/**`);
  const log = await mockLog();
  const co = log.filter((l) => l.kind === "checkout").at(-1);
  check("checkout is created on the firm's account", co?.accountId === "org_harlowtest", co?.accountId);
  check("checkout charges the consultation price", co?.amount === 150000, String(co?.amount));
  check("checkout offers the firm's payment methods", JSON.stringify(co?.methods) === JSON.stringify(["card", "gcash", "paymaya", "qrph"]));
  check("return URLs point back to this booking", co?.success_url.endsWith("/f/harlow-reyes/book/sofia-ramirez/confirmation") && co?.cancel_url.endsWith("/payment"));
  await page.getByRole("button", { name: "Pay now", exact: true }).click();
  await page.waitForURL("**/confirmation");
  await page.getByText("You're all set").waitFor({ timeout: 15000 });
  check("client lands on a confirmed booking", true);
  const r = await latestPayment("pay1@example.com");
  check("payment recorded as paid with PayMongo's payment id", r.payments[0].status === "paid" && r.payments[0].provider_payment_id?.startsWith("pay_"));
  check("appointment confirmed", r.appointmentStatus === "confirmed", r.appointmentStatus);
  const { count: invoices } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("appointment_id", r.appointmentId).eq("status", "paid");
  check("a paid invoice was created", invoices === 1, String(invoices));
  const webhookOk = (await mockLog()).filter((l) => l.kind === "webhook-sent").at(-1);
  check("webhook was accepted", webhookOk?.status === 200, String(webhookOk?.status));

  const dup = await (await fetch(`${MOCK}/__resend`, { method: "POST" })).json();
  check("a duplicate webhook is ignored", dup.status === 200 && dup.body?.duplicate === true, JSON.stringify(dup.body));
  const { count: invoices2 } = await db.from("invoices").select("id", { count: "exact", head: true }).eq("appointment_id", r.appointmentId);
  check("no second invoice from the duplicate", invoices2 === 1, String(invoices2));
  const confirmation = await waitForEmail(to("pay1@example.com", /^Booked: /));
  check("a paid booking is emailed a confirmation that mentions the payment", Boolean(confirmation?.text.includes("₱1,500")));
  const receipt = await waitForEmail(to("pay1@example.com", /^Receipt for ₱1,500/));
  check("and a receipt", Boolean(receipt));
  const paidEmails = (await sentEmails()).filter((e) => e.to.includes("pay1@example.com"));
  check("the duplicate webhook sends no second email", paidEmails.length === 2, String(paidEmails.length));
  check("no browser errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// 2. Forged webhook is rejected
{
  const forged = await (await fetch(`${MOCK}/__forged?account=org_harlowtest`, { method: "POST" })).json();
  check("a webhook with a bad signature is rejected", forged.status === 401, String(forged.status));
  const unknown = await fetch(`${BASE}/api/webhooks/paymongo/00000000-0000-4000-8000-000000000000`, { method: "POST", body: "{}" });
  check("a webhook for an unknown firm is a 404", unknown.status === 404, String(unknown.status));
}

// 3. Webhook lost: the confirmation page asks PayMongo directly
{
  const { page, ctx } = await session();
  await toPayment(page, "james-whitfield", "pay2@example.com");
  await page.getByRole("button", { name: "Pay ₱1,500 securely" }).click();
  await page.waitForURL(`${MOCK}/pay/**`);
  await page.getByRole("button", { name: "Pay now (webhook lost)" }).click();
  await page.waitForURL("**/confirmation");
  await page.getByText("You're all set").waitFor({ timeout: 15000 });
  const r = await latestPayment("pay2@example.com");
  check("without a webhook, the booking is still confirmed", r.appointmentStatus === "confirmed" && r.payments[0].status === "paid");
  await ctx.close();
}

// 4. Client goes back from PayMongo, then pays: the booking resumes, the old checkout is expired
{
  const { page, ctx } = await session();
  await toPayment(page, "priya-anand", "pay3@example.com");
  await page.getByRole("button", { name: "Pay ₱1,500 securely" }).click();
  await page.waitForURL(`${MOCK}/pay/**`);
  const firstCheckout = (await mockLog()).filter((l) => l.kind === "checkout").at(-1).id;
  await page.getByText("Back to merchant").click();
  await page.waitForURL("**/payment");
  check("returning from PayMongo resumes at the payment step", path(page).endsWith("/payment"), path(page));
  check("the booking summary survived the round trip", await page.getByText(/30-min Video Consultation with Priya Anand/).isVisible());
  await page.getByRole("button", { name: "Pay ₱1,500 securely" }).click();
  await page.waitForURL(`${MOCK}/pay/**`);
  const expiredFirst = (await mockLog()).some((l) => l.kind === "expired" && l.id === firstCheckout);
  check("the abandoned checkout was expired at PayMongo", expiredFirst);
  const r = await latestPayment("pay3@example.com");
  check("only one checkout is open per booking", r.payments.filter((p) => p.status === "pending").length === 1 && r.payments.some((p) => p.status === "expired"));
  await ctx.close();
}

// 5. Daily reconciliation: unauthorized, then releases a checkout nobody finished
{
  const unauth = await fetch(`${BASE}/api/cron/reconcile-payments`);
  check("reconciliation needs the cron secret", unauth.status === 401, String(unauth.status));
  const r = await latestPayment("pay3@example.com");
  const pending = r.payments.find((p) => p.status === "pending");
  await db.from("payments").update({ created_at: new Date(Date.now() - 40 * 60_000).toISOString() }).eq("id", pending.id);
  const run = await fetch(`${BASE}/api/cron/reconcile-payments`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const out = await run.json();
  check("reconciliation runs with the secret", run.status === 200 && out.checked >= 1, JSON.stringify(out));
  const after = await latestPayment("pay3@example.com");
  check("an unfinished checkout is released after 30 minutes", after.appointmentStatus === "canceled" && after.payments.every((p) => p.status === "expired"), after.appointmentStatus);
}

// 6. Paid after the time was given to someone else: flagged for refund, never double-booked
let releasedPaymentId;
{
  const { page, ctx } = await session();
  await toPayment(page, "tom-reilly", "pay4@example.com");
  await page.getByRole("button", { name: "Pay ₱1,500 securely" }).click();
  await page.waitForURL(`${MOCK}/pay/**`);
  const r = await latestPayment("pay4@example.com");
  const { data: appt } = await db.from("appointments").select("*").eq("id", r.appointmentId).single();
  await db.from("appointments").update({ status: "canceled", cancel_reason: "hold expired" }).eq("id", appt.id);
  await db.from("appointments").insert({
    firm_id: appt.firm_id, attorney_id: appt.attorney_id, consult_type_id: appt.consult_type_id,
    starts_at: appt.starts_at, ends_at: appt.ends_at, status: "confirmed",
  });
  await page.getByRole("button", { name: "Pay now", exact: true }).click();
  await page.waitForURL("**/confirmation");
  await page.getByText(/We received your payment, but your reserved time ran out/).waitFor({ timeout: 15000 });
  check("a late payment for a taken time tells the client plainly", true);
  const after = await latestPayment("pay4@example.com");
  releasedPaymentId = after.payments[0].id;
  check("the late booking stays canceled", after.appointmentStatus === "canceled" && after.payments[0].status === "paid");
  const { count: overlaps } = await db.from("appointments").select("id", { count: "exact", head: true }).eq("attorney_id", appt.attorney_id).eq("starts_at", appt.starts_at).eq("status", "confirmed");
  check("the attorney is not double-booked", overlaps === 1, String(overlaps));
  const unplaced = await waitForEmail(to("pay4@example.com", /^About your payment/));
  check("the client is told a refund is coming", Boolean(unplaced?.text.includes("will refund the full amount")));
  const refundAlert = await waitForEmail(to("partner@harlow.test", /^Refund due: ₱1,500 to Paying Client/));
  check("the firm's partners are told a refund is due", Boolean(refundAlert));
  await ctx.close();
}

// 7. A firm without PayMongo: paid types can't be chosen
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/f/solo-e2e/book/lone-attorney/time`);
  const paidType = page.getByRole("button", { name: /Paid Consult/ });
  check("paid types are disabled when the firm can't take payments", await paidType.isDisabled());
  check("and say why", await page.getByText("Not bookable online yet. Please contact the firm.").isVisible());
  await ctx.close();
}

// 8. Refunds from the staff billing page
{
  const { page, ctx, errors } = await session();
  await page.goto(`${BASE}/staff/login`);
  await page.fill("#staff-email", "partner@harlow.test");
  await page.fill("#staff-password", process.env.PARTNER_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/mfa-setup");
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor();
  await page.fill('input[placeholder="123456"]', totp((await secretEl.innerText()).trim()));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/calendar");
  await page.goto(`${BASE}/staff/billing`);
  check("billing shows PayMongo is connected", await page.getByText("PayMongo connected (test mode)").isVisible());
  check("billing lists the firm's payments", (await page.getByRole("button", { name: "Refund" }).count()) >= 3);
  check("a late payment is marked as refund due", await page.getByText("Paid, booking released — refund due").isVisible());

  const row = page.locator("tr", { hasText: "Paid, booking released — refund due" });
  await row.getByRole("button", { name: "Refund" }).click();
  await row.getByRole("button", { name: "Refund ₱1,500" }).click();
  // The row's status text changes once refunded, so wait for the old text to go.
  await page.getByText("Paid, booking released — refund due").waitFor({ state: "detached", timeout: 15000 });
  const refund = (await mockLog()).filter((l) => l.kind === "refund").at(-1);
  const { data: refunded } = await db.from("payments").select("*").eq("id", releasedPaymentId).single();
  check("refund goes to PayMongo on the firm's account, in full", refund?.accountId === "org_harlowtest" && refund?.amount === 150000 && refund?.payment_id === refunded.provider_payment_id);
  check("payment is recorded as refunded", refunded.status === "refunded" && refunded.provider_refund_id?.startsWith("ref_") && refunded.refunded_centavos === 150000);
  check("no browser errors on billing", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// 9. The refund is audited
{
  const { count: audits } = await db.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "payment.refunded");
  check("refund is in the audit log", audits === 1, String(audits));
}

await browser.close();
const allApi = (await mockLog()).filter((l) => l.kind === "api");
check("every PayMongo call used the secret key", allApi.every((l) => l.auth));
check("every payment call named the firm's account", allApi.filter((l) => /checkout|refund|webhooks/.test(l.path)).every((l) => l.accountId === "org_harlowtest"));
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
