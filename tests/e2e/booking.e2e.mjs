// Public firm pages and the free booking flow, in a real browser.
// Run through tests/e2e/run.sh, which prepares the database, servers and accounts.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const FIRM = "harlow-reyes";
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
};
const path = (page) => new URL(page.url()).pathname;

const pdf = join(tmpdir(), "passport.pdf");
writeFileSync(pdf, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const browser = await chromium.launch();
const session = async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
};

/** Picks the consult type, then the first date with open times, then its first time. */
async function chooseTime(page, consultLabel, timeIndex = 0) {
  await page.getByRole("button", { name: new RegExp(consultLabel) }).click();
  for (let week = 0; week < 3; week++) {
    await page.waitForFunction(() => document.querySelectorAll('button[aria-label*=", "]').length > 0);
    const open = page.locator('button[aria-label]:not([aria-label*="no open times"])').filter({ hasText: /\d/ });
    if ((await open.count()) > 0) {
      await open.first().click();
      const times = page.locator("button", { hasText: /^\d{1,2}:\d{2} (AM|PM)$/ });
      await times.first().waitFor();
      const chosen = times.nth(timeIndex);
      const label = await chosen.innerText();
      await chosen.click();
      return label;
    }
    await page.getByRole("button", { name: "Later →" }).click();
  }
  throw new Error("no open times found");
}

// --- Directory, profile, unknown routes
{
  const { page, ctx, errors } = await session();
  await page.goto(`${BASE}/f/${FIRM}`);
  check("firm directory lists the firm's attorneys", (await page.getByText("View profile").count()) === 6);
  check("header shows the firm's name", await page.locator("header").getByText("Harlow & Reyes").isVisible());
  check("page title is the firm's own", (await page.title()) === "Harlow & Reyes | Book a consultation", await page.title());
  await page.goto(`${BASE}/f/${FIRM}?practiceArea=Immigration`);
  check("filters narrow the directory", (await page.getByText("View profile").count()) === 1);
  await page.goto(`${BASE}/f/${FIRM}/attorneys/maria-chen`);
  check("profile shows IBP credentials", await page.getByText(/IBP Roll No\. 00001-SAMPLE/).isVisible());
  const missing = await page.goto(`${BASE}/f/no-such-firm`);
  check("unknown firm is a 404", missing.status() === 404, String(missing.status()));
  const oldRoute = await page.goto(`${BASE}/attorneys`);
  check("old single-firm route is gone", oldRoute.status() === 404, String(oldRoute.status()));
  await page.goto(`${BASE}/f/${FIRM}/first-available`);
  check("first-available lands on a booking page", /\/f\/harlow-reyes\/book\/[a-z-]+\/time$/.test(path(page)), path(page));
  await page.goto(`${BASE}/`);
  check("home page is the product page", await page.getByText("Online consultation booking for law firms.").isVisible());
  check("no browser errors on public pages", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// --- Full free booking
let bookedTime;
{
  const { page, ctx, errors } = await session();
  await page.goto(`${BASE}/f/${FIRM}/book/maria-chen/time`);
  check("prices are in pesos", await page.getByText("₱1,500").isVisible());
  bookedTime = await chooseTime(page, "Free 15-min Phone Screening");
  await page.getByRole("button", { name: "Continue to intake form →" }).click();
  await page.waitForURL("**/intake");
  check("holding a time opens the intake", path(page).endsWith("/intake"));

  const field = (label) => page.locator(`label:has-text("${label}") + input, label:has-text("${label}") + textarea, label:has-text("${label}") + select`);
  await page.getByRole("button", { name: "Continue →" }).click();
  check("intake requires consent", await page.getByText("Your consent is needed to book online").isVisible());
  await field("First name").fill("Juan");
  await field("Last name").fill("Dela Cruz");
  await field("Email").fill("juan.e2e@example.com");
  await field("Mobile number").fill("12345");
  await field("Case type").selectOption("Family Law");
  await field("Briefly describe your situation").fill("Custody question.");
  await field("Opposing party name").fill("Amara Smyth");
  await page.getByText("I understand this consultation").click();
  await page.getByText("I consent to Harlow & Reyes").click();
  await page.getByText("Send me appointment reminders").click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByText("Enter a Philippine mobile number").waitFor();
  check("server rejects a non-PH mobile number", true);
  await field("Mobile number").fill("0917 123 4567");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.waitForURL("**/documents");
  check("no conflict warning is shown to the client", (await page.getByText(/conflict/i).count()) === 0);

  await page.locator('input[type="file"]').setInputFiles(pdf);
  await page.getByText("passport.pdf").waitFor({ timeout: 15000 });
  check("document uploads to storage", await page.getByText("passport.pdf").isVisible());
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.waitForURL("**/agreement");
  check("agreement names the firm", await page.getByText(/consultation with Harlow & Reyes/).isVisible());
  await page.getByText("I have read and agree").click();
  await page.getByPlaceholder("Full legal name").fill("Juan Dela Cruz");
  await page.getByRole("button", { name: "Sign and continue →" }).click();
  await page.waitForURL("**/payment");
  await page.getByRole("button", { name: "Confirm free consultation" }).click();
  await page.waitForURL("**/confirmation");
  check("confirmation shows the booking", await page.getByText("You're all set, Juan").isVisible());
  check("confirmation shows the chosen time", await page.getByText(bookedTime).first().isVisible(), bookedTime);
  await page.reload();
  check("confirmation survives a refresh", await page.getByText("You're all set, Juan").isVisible());
  const ics = await page.request.get(`${BASE}/f/${FIRM}/booking.ics`);
  const body = await ics.text();
  check("calendar file downloads", ics.ok() && body.includes("BEGIN:VEVENT") && body.includes("Maria Chen"), String(ics.status()));
  check("no browser errors during booking", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// --- Double booking: a second visitor can't take the same time
{
  const a = await session();
  const b = await session();
  for (const { page } of [a, b]) await page.goto(`${BASE}/f/${FIRM}/book/david-okafor/time`);
  const labelA = await chooseTime(a.page, "Free 15-min Phone Screening");
  const labelB = await chooseTime(b.page, "Free 15-min Phone Screening");
  check("both visitors picked the same time", labelA === labelB, `${labelA} / ${labelB}`);
  await a.page.getByRole("button", { name: "Continue to intake form →" }).click();
  await a.page.waitForURL("**/intake");
  await b.page.getByRole("button", { name: "Continue to intake form →" }).click();
  await b.page.getByText("That time was just taken").waitFor();
  check("second visitor is told the time was taken", path(b.page).endsWith("/time"));
  await a.ctx.close();
  await b.ctx.close();
}

// --- Steps can't be skipped
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/f/${FIRM}/book/maria-chen/agreement`);
  await page.waitForURL("**/time");
  check("skipping ahead returns to the time step", path(page).endsWith("/time"));
  await ctx.close();
}

// --- A solo practitioner's firm skips the directory
{
  const { page, ctx } = await session();
  await page.goto(`${BASE}/f/solo-e2e`);
  check("solo firm goes straight to the attorney", path(page) === "/f/solo-e2e/attorneys/lone-attorney", path(page));
  check("solo profile has no back link", (await page.getByText("← Back to attorneys").count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
