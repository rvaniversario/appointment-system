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
