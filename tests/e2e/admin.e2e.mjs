// The operator area in a real browser: sign-in with two-factor, reviewing and approving the
// firm the signup suite created, sending back, suspending, reinstating, attorney checks,
// comps and the audit log.
// Run through tests/e2e/run.sh, after the signup suite (it reviews the firm signup made).
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { sentEmails, to, waitForEmail, waitForNewEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
const OPERATOR = "ops@platform.test";
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
const must = async (query) => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};
const shows = (page, text) => page.getByText(text).first().waitFor({ timeout: 10000 }).then(() => true, () => false);

const browser = await chromium.launch();
async function session() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}
async function signIn(page, email, password) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#staff-email", email);
  await page.fill("#staff-password", password);
  await page.click('button[type="submit"]');
}

const santos = await must(db.from("firms").select("id").eq("slug", "santos-co-law").single());
const ana = await must(db.from("attorneys").select("id").eq("firm_id", santos.id).single());

// --- Who can get in ------------------------------------------------------------------------
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/admin/firms`);
  check("a signed-out visitor is sent to operator sign-in", path(page) === "/admin/login", path(page));

  await signIn(page, "partner@harlow.test", process.env.PARTNER_PW);
  check("firm staff are refused at operator sign-in", await shows(page, "Incorrect email or password."));
  await ctx.close();

  const staff = await session();
  await staff.page.goto(`${BASE}/staff/login`);
  await staff.page.fill("#staff-email", "partner@harlow.test");
  await staff.page.fill("#staff-password", process.env.PARTNER_PW);
  await staff.page.click('button[type="submit"]');
  await staff.page.waitForURL(/\/staff\/(verify|mfa-setup)/, { timeout: 15000 });
  const res = await staff.page.goto(`${BASE}/admin/firms`);
  check("a signed-in non-operator gets not found", res.status() === 404, String(res.status()));
  await staff.ctx.close();
}

// --- An operator signs in and reviews the firm from the signup suite -----------------------
const { page, ctx, errors } = await session();
{
  await signIn(page, OPERATOR, process.env.OPERATOR_PW);
  await page.waitForURL("**/admin/mfa-setup", { timeout: 20000 });
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor({ timeout: 15000 });
  await page.fill('input[placeholder="123456"]', totp((await secretEl.innerText()).trim()));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin/firms", { timeout: 15000 });
  check("an operator signs in with two-factor", path(page) === "/admin/firms");

  const asked = await waitForEmail(to(OPERATOR, /^Santos & Co\. Law asks to go live$/));
  check("operators were emailed when the firm asked to go live", Boolean(asked?.text.includes(`/admin/firms/${santos.id}`)), asked?.subject);
  check("under the platform's name", /^"Consult Booking" </.test(asked?.from ?? ""), asked?.from);

  const first = page.getByTestId("admin-firm-row").first();
  check("firms waiting for review are listed first", (await first.getAttribute("data-slug")) === "santos-co-law", await first.getAttribute("data-slug"));
  check("the list shows the firm is waiting", (await first.innerText()).includes("Waiting for review"));
  await page.getByRole("link", { name: "Waiting for review", exact: true }).click();
  await page.waitForURL("**/admin/firms?show=review");
  check("filtering to firms waiting for review", (await page.getByTestId("admin-firm-row").count()) === 1);

  await first.click();
  await page.waitForURL(`**/admin/firms/${santos.id}`);
  const row = page.locator('[data-attorney="ana-santos"]');
  check("the attorney's roll number and year are shown to check", (await row.innerText()).includes("65432") && (await row.innerText()).includes("2015"));
  check("approval waits for an attorney check", await page.getByRole("button", { name: "Approve and go live" }).isDisabled());
  check("the firm's history shows the signup and request", (await page.locator("#firm-history [data-action]").count()) === 2);

  // Send it back
  const seen = (await sentEmails()).length;
  await page.getByRole("button", { name: "Send back" }).click();
  check("sending back needs a note", await shows(page, "Write a note for the firm."));
  await page.getByLabel("Note to the firm").fill("Please use the attorney's full name as it appears on the Roll.");
  await page.getByRole("button", { name: "Send back" }).click();
  check("the firm is sent back", await shows(page, "Sent back to the firm."));
  const back = await must(db.from("firms").select("status, review_requested_at").eq("id", santos.id).single());
  check("it stays pending and can ask again", back.status === "pending" && back.review_requested_at === null, JSON.stringify(back));
  const backMail = await waitForNewEmail(seen, to("ana@santos.test", /^We couldn't approve Santos & Co\. Law's booking page yet$/));
  check("the firm's admin is emailed the note", Boolean(backMail?.text.includes("full name as it appears on the Roll")), backMail?.subject);

  // The firm asks again; we check the attorney and approve
  await must(db.from("firms").update({ review_requested_at: new Date().toISOString() }).eq("id", santos.id));
  await page.reload();
  await page.getByRole("button", { name: "Mark Ana Santos as checked" }).click();
  check("an operator checks the attorney", await row.getByText(/^Checked /).waitFor({ timeout: 10000 }).then(() => true, () => false));
  const checked = await must(db.from("attorneys").select("ibp_checked_at, ibp_checked_by").eq("id", ana.id).single());
  check("the check records when and who", Boolean(checked.ibp_checked_at && checked.ibp_checked_by), JSON.stringify(checked));

  await page.reload();
  await page.getByRole("button", { name: "Approve and go live" }).click();
  check("the firm is approved", await shows(page, "Approved. The booking page is live."));
  check("its status is live", (await must(db.from("firms").select("status").eq("id", santos.id).single())).status === "active");
  const liveMail = await waitForEmail(to("ana@santos.test", /^Santos & Co\. Law's booking page is live$/));
  check("the firm is emailed that its page is live", Boolean(liveMail?.text.includes("/f/santos-co-law")), liveMail?.subject);

  const visitor = await session();
  const res = await visitor.page.goto(`${BASE}/f/santos-co-law`);
  check("the booking page is now public", res.status() === 200, String(res.status()));
  check("with its checked attorney", await shows(visitor.page, "Ana Santos"));

  // Suspend and reinstate
  await page.reload();
  await page.getByLabel("Note to the firm").fill("Reported misuse; contact us.");
  await page.getByRole("button", { name: "Suspend" }).click();
  check("the firm is suspended", await shows(page, "Suspended."));
  const gone = await visitor.page.goto(`${BASE}/f/santos-co-law`);
  check("a suspended firm's page is offline", gone.status() === 404, String(gone.status()));
  check("the firm is emailed the reason", Boolean((await waitForEmail(to("ana@santos.test", /booking page is offline$/)))?.text.includes("Reported misuse")));
  await page.reload();
  await page.getByRole("button", { name: "Reinstate" }).click();
  check("and reinstated", await shows(page, "Reinstated."));
  const back2 = await visitor.page.goto(`${BASE}/f/santos-co-law`);
  check("an approved firm goes back online", back2.status() === 200, String(back2.status()));

  // Comp
  await page.reload();
  await page.getByLabel("Comped (free use)").check();
  await page.getByLabel("Free until").fill("2099-12-31");
  await page.getByLabel("Internal note").fill("Early firm");
  await page.getByRole("button", { name: "Save comp" }).click();
  check("an operator comps a firm", await shows(page, "Comp saved."));
  const comp = await must(db.from("firm_platform").select("comped, comped_until, comp_note").eq("firm_id", santos.id).single());
  check("with an end date and a note", comp.comped && comp.comped_until === "2099-12-31" && comp.comp_note === "Early firm", JSON.stringify(comp));
  await visitor.ctx.close();
}

// --- A live firm's new attorney waits for a check ------------------------------------------
{
  const harlow = await must(db.from("firms").select("id").eq("slug", "harlow-reyes").single());
  await must(db.from("attorneys").insert({ firm_id: harlow.id, slug: "nora-new", full_name: "Nora New", ibp_roll_no: "88888", admitted_year: 2020 }));
  const visitor = await session();
  await visitor.page.goto(`${BASE}/f/harlow-reyes`);
  check("an unchecked attorney isn't in a live firm's directory", (await visitor.page.getByText("Nora New").count()) === 0);
  const direct = await visitor.page.goto(`${BASE}/f/harlow-reyes/attorneys/nora-new`);
  check("nor can their page be opened directly", direct.status() === 404, String(direct.status()));

  await page.goto(`${BASE}/admin/firms?show=check`);
  const rows = page.getByTestId("admin-firm-row");
  check("live firms with attorneys to check are listed", (await rows.count()) === 1 && (await rows.first().getAttribute("data-slug")) === "harlow-reyes");
  await rows.first().click();
  await page.waitForURL((url) => /^\/admin\/firms\/[0-9a-f-]{36}$/.test(url.pathname));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Mark Nora New as checked" }).click();
  const noraChecked = await page.locator('[data-attorney="nora-new"]').getByText(/^Checked /).waitFor({ timeout: 10000 }).then(() => true, () => false);
  check("an operator checks a live firm's new attorney", noraChecked, JSON.stringify(await must(db.from("attorneys").select("ibp_checked_at").eq("slug", "nora-new"))) + " " + (await page.locator('[data-attorney="nora-new"]').innerText()) + " " + page.url());
  await visitor.page.goto(`${BASE}/f/harlow-reyes`);
  check("once checked, the attorney is listed", await shows(visitor.page, "Nora New"));
  await visitor.ctx.close();
}

// --- Audit log ------------------------------------------------------------------------------
{
  await page.goto(`${BASE}/admin/audit`);
  const actions = await page.locator("#platform-audit [data-action]").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")));
  const expected = ["platform.firm_sent_back", "platform.attorney_checked", "platform.firm_approved", "platform.firm_suspended", "platform.firm_reinstated", "platform.comp_set"];
  check("every operator action is in the audit log", expected.every((a) => actions.includes(a)), actions.join(","));
  check("with who did it", await page.locator("#platform-audit").getByText("by Olive Operator").first().isVisible());

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/admin/login");
  await page.goto(`${BASE}/admin/firms`);
  check("signing out ends the operator session", path(page) === "/admin/login", path(page));
  check("no page errors", errors.length === 0, errors.join(" | "));
}

await ctx.close();
await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
