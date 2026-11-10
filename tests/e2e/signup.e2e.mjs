// Firm self-service signup in a real browser: the form, the emailed code, two-factor setup,
// the setup checklist, asking to go live, and accounts that already exist.
// Run through tests/e2e/run.sh. Run it last: it turns accounts it creates into staff.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { sentEmails, to, waitForNewEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
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

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
};
const path = (page) => new URL(page.url()).pathname;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "Signup-Pass-123456";

const browser = await chromium.launch();
async function session() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}

/** Fills the details step. */
async function fillDetails(page, d) {
  await page.fill("#signup-first", d.first);
  await page.fill("#signup-last", d.last);
  await page.fill("#signup-email", d.email);
  await page.fill("#signup-password", PASSWORD);
  await page.fill("#signup-confirm", PASSWORD);
  await page.fill("#signup-firm", d.firm);
  if (d.slug) await page.fill("#signup-slug", d.slug);
  if (d.office) await page.getByLabel("I manage the office (I'm not the attorney)").check();
  if (d.attorney) await page.fill("#signup-attorney", d.attorney);
  await page.fill("#signup-roll", d.roll ?? "65432");
  await page.fill("#signup-year", d.year ?? "2015");
  await page.check("#signup-attest");
}

/** Continues to the code step and returns the code we emailed. */
async function codeFor(page, email) {
  const seen = (await sentEmails()).length;
  await page.getByRole("button", { name: "Continue" }).click();
  const mail = await waitForNewEmail(seen, to(email, /is your code to sign up your firm/));
  if (!mail) {
    const shown = await page.locator('[role="alert"], [id$="-error"]').allInnerTexts();
    console.log("      no code email; the form shows:", JSON.stringify(shown));
  }
  return { mail, code: mail?.text.match(/^(\d{6})$/m)?.[1] ?? null };
}

async function enrollMfa(page) {
  await page.waitForURL("**/staff/mfa-setup", { timeout: 20000 });
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor({ timeout: 15000 });
  await page.fill('input[placeholder="123456"]', totp((await secretEl.innerText()).trim()));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/calendar", { timeout: 15000 });
}

// --- An attorney signs up their firm --------------------------------------------------------
{
  const { page, ctx, errors } = await session();
  await page.goto(BASE);
  await page.getByRole("link", { name: "Sign up your firm" }).click();
  await page.waitForURL("**/signup");
  check("the home page links to signup", path(page) === "/signup");

  await fillDetails(page, { first: "Ana", last: "Santos", email: "ana@santos.test", firm: "Santos & Co. Law" });
  check("the page address follows the firm name", (await page.inputValue("#signup-slug")) === "santos-co-law", await page.inputValue("#signup-slug"));
  check("an attorney signer's name fills the attorney name", (await page.inputValue("#signup-attorney")) === "Ana Santos");

  await page.fill("#signup-slug", "harlow-reyes");
  await page.locator("#signup-slug").blur();
  check("a taken page address is flagged", await page.getByText("That page address is taken. Try another.").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await page.fill("#signup-slug", "admin");
  await page.getByRole("button", { name: "Continue" }).click();
  check("a reserved address is refused", await page.getByText("That address is reserved. Try another.").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await page.fill("#signup-slug", "santos-co-law");

  const { mail, code } = await codeFor(page, "ana@santos.test");
  check("a code is emailed under the platform's name", Boolean(code) && /^"Consult Booking" </.test(mail?.from ?? ""), mail?.from);
  check("the code email names the firm", mail?.text.includes("create Santos & Co. Law's account"));
  check("no firm exists before the code is entered", !(await db.from("firms").select("id").eq("slug", "santos-co-law").maybeSingle()).data);

  await page.getByRole("button", { name: "Send a new code" }).click();
  check("a new code can't be sent straight away", await page.getByText("Please wait a minute").waitFor({ timeout: 10000 }).then(() => true, () => false));

  await page.fill("#signup-code", code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Create firm and set up two-factor" }).click();
  check("a wrong code is refused", await page.getByText("That code isn't right.").waitFor({ timeout: 10000 }).then(() => true, () => false));

  await page.fill("#signup-code", code);
  await page.getByRole("button", { name: "Create firm and set up two-factor" }).click();
  await enrollMfa(page);
  check("the right code creates the account and goes to two-factor setup, then the dashboard", path(page) === "/staff/calendar");

  const { data: firm } = await db.from("firms").select("id, status, contact_email, created_by").eq("slug", "santos-co-law").single();
  check("the firm is pending, with the signer's email as contact", firm.status === "pending" && firm.contact_email === "ana@santos.test", JSON.stringify(firm));
  const { data: member } = await db.from("firm_memberships").select("role").eq("profile_id", firm.created_by).single();
  const { data: attorney } = await db.from("attorneys").select("id, full_name, ibp_roll_no, admitted_year, profile_id").eq("firm_id", firm.id).single();
  check("the signer is the admin and the linked attorney", member.role === "admin" && attorney.profile_id === firm.created_by && attorney.ibp_roll_no === "65432", JSON.stringify(attorney));
  check("the signer's name is saved", (await db.from("profiles").select("first_name, last_name").eq("id", firm.created_by).single()).data.first_name === "Ana");

  const panel = page.locator("#launch-panel");
  check("the dashboard shows the setup checklist", await panel.isVisible());
  const done = async (step) => (await panel.locator(`[data-step="${step}"]`).getAttribute("data-done")) === "true";
  check("the attorney and contact steps are already done", (await done("attorney")) && (await done("contact")));
  check("consultations and hours are still to do", !(await done("consult")) && !(await done("hours")));
  check("asking to go live waits for setup", await page.getByRole("button", { name: "Ask to go live" }).isDisabled());

  const visitor = await session();
  const res = await visitor.page.goto(`${BASE}/f/santos-co-law`);
  check("the booking page is hidden while pending", res.status() === 404, String(res.status()));
  await visitor.ctx.close();

  await db.from("consult_types").insert({ firm_id: firm.id, slug: "intro", label: "Intro Call", mode: "phone", duration_minutes: 30 });
  await db.from("availability_rules").insert({ attorney_id: attorney.id, weekday: 1, start_time: "09:00", end_time: "12:00" });
  await page.reload();
  await page.getByRole("button", { name: "Ask to go live" }).click();
  check("once set up, the firm can ask to go live", await page.getByText("Your booking page is being reviewed").waitFor({ timeout: 10000 }).then(() => true, () => false));
  const { data: after } = await db.from("firms").select("status, review_requested_at").eq("id", firm.id).single();
  check("the request is recorded but the page stays hidden", after.status === "pending" && Boolean(after.review_requested_at), JSON.stringify(after));

  check("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// --- An office manager signs up, using an email that is already a client account ----------
{
  await db.auth.admin.createUser({ email: "maria@cruz.test", password: "Client-Old-Pass-123", email_confirm: true });
  const { page, ctx } = await session();
  await page.goto(`${BASE}/signup`);
  await fillDetails(page, { first: "Maria", last: "Cruz", email: "maria@cruz.test", firm: "Cruz Legal", office: true, attorney: "Atty. Ben Cruz", roll: "12345", year: "2001" });
  const { code } = await codeFor(page, "maria@cruz.test");
  await page.fill("#signup-code", code);
  await page.getByRole("button", { name: "Create firm and set up two-factor" }).click();
  await enrollMfa(page);
  const { data: firm } = await db.from("firms").select("id, created_by").eq("slug", "cruz-legal").single();
  const { data: attorney } = await db.from("attorneys").select("full_name, profile_id").eq("firm_id", firm.id).single();
  check("an office manager's firm gets the attorney they named, unlinked", attorney.full_name === "Atty. Ben Cruz" && attorney.profile_id === null, JSON.stringify(attorney));
  const { error: oldPw } = await db.auth.signInWithPassword({ email: "maria@cruz.test", password: "Client-Old-Pass-123" });
  check("an existing account, once proven by the code, takes the new password", Boolean(oldPw));
  await ctx.close();
}

// --- Someone already on a firm's staff can't sign up another firm --------------------------
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/signup`);
  await fillDetails(page, { first: "Pat", last: "Partner", email: "partner@harlow.test", firm: "Second Firm" });
  const { code } = await codeFor(page, "partner@harlow.test");
  await page.fill("#signup-code", code);
  await page.getByRole("button", { name: "Create firm and set up two-factor" }).click();
  check("staff of another firm are told to sign in instead", await page.getByText("This email already belongs to a firm's staff.").waitFor({ timeout: 10000 }).then(() => true, () => false));
  check("and no second firm is created", !(await db.from("firms").select("id").eq("slug", "second-firm").maybeSingle()).data);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
