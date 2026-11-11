// Firm settings, staff invites and attorney management, in a real browser.
// Run through tests/e2e/run.sh, which prepares the database and servers.
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { to, waitForEmail } from "./mail.mjs";

const BASE = "http://localhost:3100";
const MAILPIT = "http://127.0.0.1:54324";
const PASSWORD = "Staff-Pass-123456";
const NEW_PASSWORD = "Joined-Pass-123456";
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
async function eventually(read, ok, tries = 30) {
  let value;
  for (let i = 0; i < tries; i++) {
    value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 300));
  }
  return value;
}

// --- TOTP
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

// --- Fixture: a firm with a partner and one linked attorney, plus an existing client account
const user = async (email, password, names) => {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  if (names) await must(db.from("profiles").update(names).eq("id", data.user.id));
  return data.user;
};
const partner = await user("partner@settings.test", PASSWORD, { first_name: "Pia", last_name: "Partner" });
const atty = await user("atty@settings.test", PASSWORD, { first_name: "Ana", last_name: "Atty" });
const temp = await user("temp@settings.test", PASSWORD, { first_name: "Tim", last_name: "Temp" });
const existing = await user("existing@client.test", undefined, { first_name: "Ella", last_name: "Existing" });

const [firm] = await must(db.from("firms").insert({ slug: "settings-e2e", name: "Settings E2E Law", status: "active" }).select("id"));
await must(
  db.from("firm_memberships").insert([
    { profile_id: partner.id, firm_id: firm.id, role: "partner" },
    { profile_id: atty.id, firm_id: firm.id, role: "attorney" },
    { profile_id: temp.id, firm_id: firm.id, role: "attorney" },
  ]),
);
const [ana] = await must(
  db.from("attorneys").insert({ firm_id: firm.id, profile_id: atty.id, slug: "ana-atty", full_name: "Ana Atty", ibp_roll_no: "11111", ibp_checked_at: new Date().toISOString() }).select("id"),
);

const png = join(tmpdir(), "logo.png");
// A 1x1 transparent PNG.
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

const browser = await chromium.launch();
async function newSession() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}
async function enrollMfa(page) {
  await page.waitForURL("**/staff/mfa-setup", { timeout: 15000 });
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor({ timeout: 15000 });
  await page.fill('input[placeholder="123456"]', totp((await secretEl.innerText()).trim()));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/calendar", { timeout: 15000 });
}
async function staffSignIn(email, password = PASSWORD) {
  const s = await newSession();
  await s.page.goto(`${BASE}/staff/login`);
  await s.page.fill("#staff-email", email);
  await s.page.fill("#staff-password", password);
  await s.page.click('button[type="submit"]');
  await enrollMfa(s.page);
  return s;
}
const firmRow = () => must(db.from("firms").select("name, cancellation_cutoff_hours, logo_path, agreement_text").eq("id", firm.id).single());

let newInviteLink;
let existingInviteLink;

// =========================================================================
// Partner: settings
// =========================================================================
{
  const { ctx, page, errors } = await staffSignIn("partner@settings.test");
  check("partners see Firm settings in the menu", (await page.getByRole("link", { name: "Firm settings" }).count()) === 1);

  await page.goto(`${BASE}/staff/firm`);
  await page.getByLabel("Cancellation cutoff in hours").fill("48");
  await page.getByRole("textbox", { name: "Contact email" }).fill("hello@settings.test");
  await page.getByRole("button", { name: "Save firm settings" }).click();
  await page.getByText("Saved.").waitFor({ timeout: 10000 });
  let row = await firmRow();
  check("firm settings are saved", row.cancellation_cutoff_hours === 48, JSON.stringify(row));
  // The form itself stops an out-of-range cutoff; the server rejects it too (zod).
  await page.getByLabel("Cancellation cutoff in hours").fill("999");
  await page.getByRole("button", { name: "Save firm settings" }).click();
  const overflow = await page.getByLabel("Cancellation cutoff in hours").evaluate((el) => el.validity.rangeOverflow);
  check("an out-of-range cutoff is refused", overflow && (await firmRow()).cancellation_cutoff_hours === 48);
  await page.getByLabel("Cancellation cutoff in hours").fill("48");

  await page.setInputFiles('input[aria-label="Upload logo"]', png);
  row = await eventually(firmRow, (r) => Boolean(r.logo_path));
  check("a logo is uploaded into the firm's folder", Boolean(row.logo_path?.startsWith(`${firm.id}/`)), row.logo_path);

  // Consultation types
  await page.goto(`${BASE}/staff/firm/consultations`);
  await page.getByRole("textbox", { name: "Name" }).fill("Free Phone Call");
  await page.getByRole("combobox", { name: "How" }).selectOption("phone");
  await page.getByRole("combobox", { name: "Length" }).selectOption("15");
  await page.getByRole("button", { name: "Add consultation type" }).click();
  await page.getByTestId("consult-type").filter({ hasText: "Free Phone Call" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "+ Add consultation type" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Video Consultation");
  await page.getByLabel("Price in pesos").fill("10");
  await page.getByRole("button", { name: "Add consultation type" }).click();
  await page.getByText(/at least ₱20/).first().waitFor({ timeout: 10000 });
  check("prices under PayMongo's minimum are refused", true);
  await page.getByLabel("Price in pesos").fill("1500");
  await page.getByRole("button", { name: "Add consultation type" }).click();
  await page.getByTestId("consult-type").filter({ hasText: "₱1,500" }).waitFor({ timeout: 10000 });
  const types = await must(db.from("consult_types").select("label, slug, price_centavos, mode").eq("firm_id", firm.id).order("sort_order"));
  check("consultation types are saved in order", types.map((t) => t.label).join("|") === "Free Phone Call|Video Consultation", JSON.stringify(types));
  check("prices are stored in centavos", types[1]?.price_centavos === 150000);
  check("a paid type warns while PayMongo isn't connected", await page.getByText(/isn't connected to PayMongo yet/).isVisible());
  await page.getByRole("button", { name: "Move Video Consultation up" }).click();
  await eventually(
    () => must(db.from("consult_types").select("label").eq("firm_id", firm.id).order("sort_order")),
    (r) => r[0]?.label === "Video Consultation",
  );
  check("consultation types can be reordered", true);

  // Offices
  await page.goto(`${BASE}/staff/firm/offices`);
  await page.getByRole("textbox", { name: "Name" }).fill("Makati");
  await page.getByRole("textbox", { name: "Address" }).fill("Ayala Ave, Makati City");
  await page.getByRole("button", { name: "Add office" }).click();
  await page.getByTestId("office").filter({ hasText: "Makati" }).waitFor({ timeout: 10000 });
  check("an office is added", (await must(db.from("offices").select("id").eq("firm_id", firm.id))).length === 1);

  // A new attorney, with a photo
  await page.goto(`${BASE}/staff/firm/attorneys/new`);
  await page.getByRole("textbox", { name: "Full name" }).fill("Noel Nuevo");
  await page.getByRole("textbox", { name: "Practice areas" }).fill("Labor Law, Family Law");
  await page.getByRole("combobox", { name: "Office" }).selectOption({ label: "Makati" });
  await page.getByRole("button", { name: "Add attorney" }).click();
  await page.getByText("Attorney added.").waitFor({ timeout: 10000 });
  const [noel] = await must(db.from("attorneys").select("id, slug, practice_areas, office_id").eq("firm_id", firm.id).eq("full_name", "Noel Nuevo"));
  check("a new attorney gets a page address from their name", noel?.slug === "noel-nuevo", noel?.slug);
  check("the form says a new attorney waits for our check", await page.locator("#ibp-check-note").getByText("isn't on your booking page until we check").isVisible());
  {
    const visitor = await browser.newPage();
    await visitor.goto(`${BASE}/f/settings-e2e`);
    check("a new attorney stays off the booking page until we check them", (await visitor.getByText("Noel Nuevo").count()) === 0);
    await visitor.close();
  }
  // Our operator checks the roll number (the admin suite does this in the browser). The photo
  // upload below refreshes the cached public pages.
  await must(db.from("attorneys").update({ ibp_roll_no: "77777", admitted_year: 2019 }).eq("id", noel.id));
  await must(db.from("attorneys").update({ ibp_checked_at: new Date().toISOString() }).eq("id", noel.id));
  check("practice areas are saved as a list", noel?.practice_areas.join("|") === "Labor Law|Family Law");
  await page.setInputFiles('input[aria-label="Upload photo"]', png);
  const withPhoto = await eventually(() => must(db.from("attorneys").select("photo_path").eq("id", noel.id).single()), (r) => Boolean(r.photo_path));
  check("an attorney photo is uploaded", Boolean(withPhoto.photo_path?.startsWith(`${firm.id}/${noel.id}/`)), withPhoto.photo_path);

  // Staff: invites and roles
  await page.goto(`${BASE}/staff/firm/staff`);
  await page.getByRole("textbox", { name: "Email" }).fill("new@settings.test");
  await page.getByRole("combobox", { name: "Attorney profile" }).selectOption({ label: "Noel Nuevo" });
  await page.getByRole("button", { name: "Send invite" }).click();
  await page.getByLabel("Invite link").waitFor({ timeout: 10000 });
  newInviteLink = await page.getByLabel("Invite link").inputValue();
  check("an invite link is shown once", /\/staff\/invite\/[A-Za-z0-9_-]{40,}$/.test(newInviteLink), newInviteLink);
  const invites = await must(db.from("staff_invites").select("token_hash").eq("email", "new@settings.test"));
  check("only the token's hash is stored", invites.length === 1 && !newInviteLink.includes(invites[0].token_hash));
  check("the page says the invite was emailed", await page.getByText("We emailed the invite to new@settings.test.").isVisible());
  const inviteEmail = await waitForEmail(to("new@settings.test", /^Pia Partner invited you to Settings E2E Law/));
  check("the invite is emailed with its link", Boolean(inviteEmail?.text.includes(newInviteLink)));
  const logged = await must(db.from("notification_log").select("status, payload").eq("template", "staff_invite").eq("recipient", "new@settings.test"));
  check("the invite email is logged, without the link", logged.length === 1 && logged[0].status === "sent" && !JSON.stringify(logged[0]).includes("/staff/invite/"));

  await page.getByRole("textbox", { name: "Email" }).fill("existing@client.test");
  await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("partner");
  await page.getByRole("button", { name: "Send invite" }).click();
  await page.waitForFunction((old) => document.querySelector('input[aria-label="Invite link"]')?.value !== old, newInviteLink, { timeout: 10000 });
  existingInviteLink = await page.getByLabel("Invite link").inputValue();

  await page.getByRole("textbox", { name: "Email" }).fill("atty@settings.test");
  await page.getByRole("button", { name: "Send invite" }).click();
  await page.getByText("That person is already on your staff.").waitFor({ timeout: 10000 });
  check("inviting an existing member is refused", true);

  check("nobody can remove themselves", (await page.getByRole("button", { name: "Remove Pia Partner" }).count()) === 0);
  await page.getByRole("combobox", { name: "Role for Tim Temp" }).selectOption("admin");
  await eventually(() => must(db.from("firm_memberships").select("role").eq("profile_id", temp.id).single()), (r) => r.role === "admin");
  check("a partner changes another member's role", true);
  await page.getByRole("button", { name: "Remove Tim Temp" }).click();
  await page.getByRole("button", { name: "Yes, remove access" }).click();
  const gone = await eventually(() => must(db.from("firm_memberships").select("profile_id").eq("profile_id", temp.id)), (r) => r.length === 0);
  check("a partner removes a member", gone.length === 0);
  const audits = await must(db.from("audit_log").select("action").eq("firm_id", firm.id));
  check("staff changes are audited", ["staff.invited", "staff.role_changed", "staff.removed"].every((a) => audits.some((x) => x.action === a)));

  check("no browser errors for the partner", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// =========================================================================
// Accepting invites
// =========================================================================
{
  const { ctx, page, errors } = await newSession();
  await page.goto(newInviteLink);
  check("a signed-out visitor can open an invite link", path(page).startsWith("/staff/invite/"), path(page));
  check("the invite names the firm", await page.getByRole("heading", { name: "Join Settings E2E Law" }).isVisible());
  await page.fill("#invite-first", "Nina");
  await page.fill("#invite-last", "New");
  await page.fill("#invite-password", "short");
  await page.fill("#invite-confirm", "short");
  await page.getByRole("button", { name: "Join and set up two-factor" }).click();
  await page.getByText(/12 to 72 characters/).waitFor({ timeout: 10000 });
  check("weak passwords are refused", true);
  await page.fill("#invite-password", NEW_PASSWORD);
  await page.fill("#invite-confirm", NEW_PASSWORD);
  await page.getByRole("button", { name: "Join and set up two-factor" }).click();
  await enrollMfa(page);
  check("a new member goes through MFA setup into the dashboard", path(page) === "/staff/calendar");
  const profile = await must(db.from("profiles").select("id, first_name").eq("email", "new@settings.test").single());
  const membership = await must(db.from("firm_memberships").select("role, firm_id").eq("profile_id", profile.id).single());
  check("the new member joins with the invited role", membership.role === "attorney" && membership.firm_id === firm.id);
  const linked = await must(db.from("attorneys").select("profile_id").eq("full_name", "Noel Nuevo").single());
  check("the new member is linked to the chosen attorney profile", linked.profile_id === profile.id);
  check("no browser errors accepting a new invite", errors.length === 0, errors.join(" | "));
  await ctx.close();

  const again = await newSession();
  await again.page.goto(newInviteLink);
  check("an invite link works only once", await again.page.getByText(/already been used/).isVisible());
  await again.page.goto(`${BASE}/staff/invite/${"x".repeat(43)}`);
  check("a made-up link is refused", await again.page.getByText(/isn't valid/).isVisible());
  await again.ctx.close();
}
{
  // An email that already has an account must prove it's theirs.
  const { ctx, page, errors } = await newSession();
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await page.goto(existingInviteLink);
  check("an existing account is asked to confirm by email", await page.getByText(/already has an account/).isVisible());
  await page.fill("#invite-first", "Ella");
  await page.fill("#invite-last", "Existing");
  await page.fill("#invite-password", NEW_PASSWORD);
  await page.fill("#invite-confirm", NEW_PASSWORD);
  check("joining waits for the code", await page.getByRole("button", { name: "Join and set up two-factor" }).isDisabled());
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.locator("#invite-code").waitFor({ timeout: 10000 });
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent("to:existing@client.test")}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) code = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text?.match(/\b(\d{6})\b/)?.[1] ?? null;
    if (!code) await new Promise((r) => setTimeout(r, 500));
  }
  await page.fill("#invite-code", "000000");
  await page.getByRole("button", { name: "Join and set up two-factor" }).click();
  await page.getByText(/invalid or has expired/).waitFor({ timeout: 10000 });
  const stillOut = await must(db.from("firm_memberships").select("profile_id").eq("profile_id", existing.id));
  check("a wrong code doesn't let anyone in", stillOut.length === 0);
  await page.fill("#invite-code", code ?? "");
  await page.getByRole("button", { name: "Join and set up two-factor" }).click();
  await enrollMfa(page);
  const membership = await must(db.from("firm_memberships").select("role").eq("profile_id", existing.id).single());
  check("an existing account joins after confirming its email", membership.role === "partner");
  check("no browser errors accepting with an existing account", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// =========================================================================
// Attorney: own profile only
// =========================================================================
{
  const { ctx, page, errors } = await staffSignIn("atty@settings.test");
  check("attorneys don't see Firm settings", (await page.getByRole("link", { name: "Firm settings" }).count()) === 0);
  await page.getByRole("link", { name: "Your profile" }).click();
  await page.waitForURL(`**/staff/firm/attorneys/${ana.id}`);
  check("an attorney's name and IBP number are locked", await page.getByRole("textbox", { name: "IBP Roll No." }).getAttribute("readonly") !== null);
  await page.getByRole("textbox", { name: "Bio" }).fill("Labor lawyer in Makati.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.getByText("Saved.").waitFor({ timeout: 10000 });
  const saved = await must(db.from("attorneys").select("bio, ibp_roll_no").eq("id", ana.id).single());
  check("an attorney saves their own bio", saved.bio === "Labor lawyer in Makati." && saved.ibp_roll_no === "11111");
  await page.goto(`${BASE}/staff/firm`);
  check("an attorney can't open firm settings", path(page) === "/staff/calendar", path(page));
  const noel = await must(db.from("attorneys").select("id").eq("full_name", "Noel Nuevo").single());
  const other = await page.goto(`${BASE}/staff/firm/attorneys/${noel.id}`);
  check("an attorney can't open a colleague's profile", other?.status() === 404, String(other?.status()));
  check("no browser errors for the attorney", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// =========================================================================
// Public booking page
// =========================================================================
{
  const { ctx, page, errors } = await newSession();
  await page.goto(`${BASE}/f/settings-e2e`);
  const logo = await page.locator("header img").getAttribute("src");
  check("the firm's logo shows in its booking page header", Boolean(logo?.includes("/firm-logos/")), logo ?? "");
  const photo = await page.getByRole("img", { name: "Photo of Noel Nuevo" }).getAttribute("style");
  check("the attorney's photo shows in the directory", Boolean(photo?.includes("/attorney-photos/")), photo ?? "");
  check("no browser errors on the public page", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
