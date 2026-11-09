// Emails the app sent through the mock Resend server (tests/e2e/mock-resend.mjs).
const MOCK = "http://localhost:4020";

export const sentEmails = async () => (await fetch(`${MOCK}/_emails`)).json();

/** Emails go out just after the response, so wait for one that matches. */
export async function waitForEmail(match, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await sentEmails()).find(match);
    if (found || Date.now() > deadline) return found ?? null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

export const to = (address, subject) => (e) => e.to.includes(address) && (subject ? subject.test(e.subject) : true);

export const failNextSends = (count) => fetch(`${MOCK}/_fail?count=${count}`, { method: "POST" });

/** Like waitForEmail, but only among emails sent after the first `seen`. */
export async function waitForNewEmail(seen, match, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = (await sentEmails()).slice(seen).find(match);
    if (found || Date.now() > deadline) return found ?? null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The 6-digit code in a guest booking code email (on a line of its own). */
export const codeIn = (email) => email?.text.match(/^(\d{6})$/m)?.[1] ?? null;

/** Submits the intake as a guest and confirms the emailed code. */
export async function continueWithEmailCode(page, address) {
  const seen = (await sentEmails()).length;
  await page.getByRole("button", { name: "Continue →" }).click();
  const code = codeIn(await waitForNewEmail(seen, to(address, /is your code/)));
  if (!code) throw new Error(`no booking code reached ${address}`);
  await page.fill("#email-code", code);
  await page.getByRole("button", { name: "Confirm and continue →" }).click();
}
