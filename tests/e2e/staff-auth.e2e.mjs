// Staff sign-in, MFA enrollment and role checks, in a real browser.
// Run through tests/e2e/run.sh, which prepares the database, servers and accounts.
import { createHmac } from "node:crypto";
import { chromium } from "playwright";

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

const browser = await chromium.launch();

async function session() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}

async function login(page, email, password) {
  await page.goto(`${BASE}/staff/login`);
  await page.fill("#staff-email", email);
  await page.fill("#staff-password", password);
  await page.click('button[type="submit"]');
}

async function enrollMfa(page) {
  await page.waitForURL("**/staff/mfa-setup", { timeout: 15000 });
  const secretEl = page.locator("div").filter({ hasText: /^[A-Z2-7]{16,}$/ }).last();
  await secretEl.waitFor({ timeout: 15000 });
  const secret = (await secretEl.innerText()).trim();
  await page.fill('input[placeholder="123456"]', totp(secret));
  await page.click('button[type="submit"]');
  await page.waitForURL("**/staff/calendar", { timeout: 15000 });
  return secret;
}

// Signed out
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/staff/calendar`);
  check("signed-out visitor is sent to staff login", path(page) === "/staff/login", path(page));
  await page.goto(`${BASE}/portal/appointments`);
  check("signed-out visitor is sent to portal login", path(page) === "/portal/login", path(page));
  await ctx.close();
}

// A client (no membership) can't use staff login
{
  const { page, ctx } = await session();
  await login(page, "client@ui.test", process.env.CLIENT_PW);
  const message = page.getByText("Incorrect email or password.");
  const shown = await message.waitFor({ timeout: 15000 }).then(() => true, () => false);
  const alerts = await page.locator('[role="alert"]').evaluateAll((els) =>
    els.map((e) => `${e.parentNode?.host?.tagName ?? e.tagName}: ${JSON.stringify(e.textContent)}`),
  );
  console.log("      alerts on page:", alerts);
  check("client is refused at staff login", shown && path(page) === "/staff/login", path(page));
  await page.goto(`${BASE}/staff/calendar`);
  check("client's session was ended", path(page) === "/staff/login", path(page));
  await ctx.close();
}

// Firm admin
{
  const { page, ctx, errors } = await session();
  await login(page, "admin@ui.test", process.env.ADMIN_PW);
  await enrollMfa(page);
  check("admin reaches the dashboard after MFA setup", path(page) === "/staff/calendar", path(page));
  await page.goto(`${BASE}/staff/billing`);
  check("admin can open billing", path(page) === "/staff/billing", path(page));
  await page.goto(`${BASE}/portal/appointments`);
  check("staff can open the client portal", path(page) === "/portal/appointments", path(page));
  await page.goto(`${BASE}/staff/settings`);
  check("admin can open settings", path(page) === "/staff/settings", path(page));
  check("no browser errors for admin", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// Attorney: pre-MFA is held back, billing is blocked after MFA
{
  const { page, ctx, errors } = await session();
  await login(page, "attorney@ui.test", process.env.ATTY_PW);
  await page.waitForURL("**/staff/mfa-setup", { timeout: 15000 });
  await page.goto(`${BASE}/staff/calendar`);
  check("attorney without MFA can't reach the dashboard", path(page) === "/staff/mfa-setup", path(page));
  await enrollMfa(page);
  check("attorney reaches the dashboard after MFA setup", path(page) === "/staff/calendar", path(page));
  await page.goto(`${BASE}/staff/billing`);
  check("attorney is blocked from billing", path(page) === "/staff/calendar", path(page));
  check("no browser errors for attorney", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
