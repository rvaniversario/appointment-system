import { describe, expect, it } from "vitest";
import { renderEmail, whenLabel, type BookingFacts } from "./templates";

const ctx = {
  firmName: "Harlow & Reyes",
  siteUrl: "https://app.example",
  fromAddress: "notifications@mail.example.com",
  now: new Date("2026-11-09T00:00:00Z"),
};

const facts: BookingFacts = {
  appointmentId: "3a000000-0000-4000-8000-000000000001",
  consultLabel: "Initial Consultation",
  attorneyName: "Atty. Maria Reyes",
  startsAt: "2026-11-20T01:00:00Z",
  endsAt: "2026-11-20T01:30:00Z",
  mode: "video",
  where: "https://meet.example/abc",
};

describe("whenLabel", () => {
  it("shows Manila time", () => {
    expect(whenLabel("2026-11-20T01:00:00Z")).toBe("Fri, Nov 20, 2026 at 9:00 AM");
  });
});

describe("renderEmail", () => {
  it("renders a confirmation with details, a portal link and a calendar file", () => {
    const email = renderEmail("booking_confirmed", { ...facts, clientName: "Juan", priceCentavos: 150000, cutoffHours: 24 }, ctx);
    expect(email.subject).toBe("Booked: Initial Consultation with Atty. Maria Reyes, Fri, Nov 20, 2026 at 9:00 AM");
    expect(email.text).toContain("Hi Juan,");
    expect(email.text).toContain("₱1,500");
    expect(email.text).toContain("Meeting link: https://meet.example/abc");
    expect(email.text).toContain("https://app.example/portal/appointments");
    expect(email.text).toContain("up to 24 hours before");
    expect(email.ics).toContain("METHOD:PUBLISH");
    expect(email.ics).toContain("URL:https://meet.example/abc");
  });

  it("escapes HTML from names and firm data", () => {
    const email = renderEmail("message_received", { clientName: "<b>Juan</b>", attorneyName: "Atty. <script>", threadId: "t" }, ctx);
    expect(email.html).not.toContain("<b>Juan</b>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;b&gt;Juan&lt;/b&gt;");
    expect(email.html).toContain("Harlow &amp; Reyes");
  });

  it("asks staff to sign in to read a message", () => {
    const email = renderEmail("staff_message_received", { clientName: "Juan dela Cruz", threadId: "t" }, ctx);
    expect(email.text).toContain("Sign in to read and reply");
    expect(email.text).toContain("https://app.example/staff/messages");
  });

  it("flags urgent and conflicting bookings for staff", () => {
    const email = renderEmail(
      "staff_new_booking",
      { ...facts, clientName: "Juan dela Cruz", urgent: true, conflict: true, paid: false },
      ctx,
    );
    expect(email.subject.startsWith("[Urgent, Possible conflict] New booking: Juan dela Cruz")).toBe(true);
    expect(email.text).toContain(`https://app.example/staff/appointments/${facts.appointmentId}`);
    expect(email.ics).toBeUndefined();
  });

  it("tells a client a declined paid booking will be refunded, with a cancellation file", () => {
    const email = renderEmail("booking_canceled", { ...facts, clientName: "Juan", by: "firm", refundDue: true }, ctx);
    expect(email.text).toContain("isn't able to take it");
    expect(email.text).toContain("will refund the fee");
    expect(email.ics).toContain("METHOD:CANCEL");
  });

  it("describes phone and in-person consultations", () => {
    const phone = renderEmail("booking_approved", { ...facts, mode: "phone", where: null, clientName: "" }, ctx);
    expect(phone.text).toContain("Hello,");
    expect(phone.text).toContain("How: The attorney will call your mobile number");
    const office = renderEmail("booking_approved", { ...facts, mode: "in_person", where: "Makati Office, 1 Ayala Ave", clientName: "Juan" }, ctx);
    expect(office.text).toContain("Where: Makati Office, 1 Ayala Ave");
  });

  it("puts the link in an invite, with its own footer", () => {
    const email = renderEmail(
      "staff_invite",
      { inviterName: "Pat Partner", role: "admin", link: "https://app.example/staff/invite/tok", expiresAt: "2026-11-16T00:00:00Z" },
      ctx,
    );
    expect(email.subject).toBe("Pat Partner invited you to Harlow & Reyes");
    expect(email.text).toContain("as an admin");
    expect(email.text).toContain("Accept the invite: https://app.example/staff/invite/tok");
    expect(email.text).toContain("invited this address");
  });

  it("shows a guest's booking code on its own line", () => {
    const email = renderEmail("booking_email_code", { code: "042917", minutes: 10 }, ctx);
    expect(email.subject).toBe("042917 is your code to book with Harlow & Reyes");
    expect(email.text).toMatch(/^042917$/m);
    expect(email.html).toContain(">042917</p>");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.text).toContain("Someone entered this address on Harlow & Reyes's booking page.");
  });
});

describe("reminder emails", () => {
  it("reminds a day ahead with the change policy", () => {
    const email = renderEmail("reminder_24h", { ...facts, clientName: "Juan", cutoffHours: 24 }, ctx);
    expect(email.subject).toBe("Reminder: Initial Consultation tomorrow at 9:00 AM");
    expect(email.text).toContain("Meeting link: https://meet.example/abc");
    expect(email.text).toContain("up to 24 hours before the start");
    expect(email.ics).toBeUndefined();
  });

  it("tells a phone client to keep their phone nearby an hour ahead", () => {
    const email = renderEmail("reminder_1h", { ...facts, mode: "phone", where: null, clientName: "Juan" }, ctx);
    expect(email.subject).toBe("Starting soon: Initial Consultation at 9:00 AM");
    expect(email.text).toContain("Keep your phone nearby");
  });

  it("tells managers when texts stop for the month", () => {
    const email = renderEmail("staff_sms_limit_reached", { cap: 200, month: "2026-11-01" }, ctx);
    expect(email.subject).toBe("Harlow & Reyes reached its text message limit for November 2026");
    expect(email.text).toContain("keep getting email reminders");
  });
});

describe("signup code email", () => {
  it("shows the code under the platform's name", () => {
    const email = renderEmail("signup_email_code", { code: "482913", minutes: 10, firmName: "Santos Law" }, { ...ctx, firmName: "Consult Booking" });
    expect(email.subject).toBe("482913 is your code to sign up your firm");
    expect(email.text).toMatch(/^482913$/m);
    expect(email.text).toContain("create Santos Law's account");
  });
});

describe("platform emails", () => {
  const platform = { ...ctx, senderName: "Consult Booking" };

  it("come from the platform, about the firm", () => {
    const email = renderEmail("platform_firm_approved", { slug: "harlow-reyes" }, platform);
    expect(email.subject).toBe("Harlow & Reyes's booking page is live");
    expect(email.html).toContain(">Consult Booking</div>");
    expect(email.text).toContain("https://app.example/f/harlow-reyes");
    expect(email.text).toContain("manage Harlow & Reyes on Consult Booking");
  });

  it("pass the operator's note to the firm, escaped", () => {
    const email = renderEmail("platform_firm_sent_back", { note: "Roll No. <12345> doesn't match." }, platform);
    expect(email.text).toContain("Roll No. <12345> doesn't match.");
    expect(email.html).toContain("Roll No. &lt;12345&gt; doesn&#39;t match.");
  });

  it("say whether a reinstated firm is live again", () => {
    expect(renderEmail("platform_firm_reinstated", { slug: "hr", live: true }, platform).subject).toContain("back online");
    expect(renderEmail("platform_firm_reinstated", { slug: "hr", live: false }, platform).text).toContain("ask to go live");
  });

  it("link operators to the firm's review page", () => {
    const email = renderEmail("platform_review_requested", { firmId: "f1", slug: "hr" }, platform);
    expect(email.text).toContain("https://app.example/admin/firms/f1");
    expect(renderEmail("platform_attorney_to_check", { firmId: "f1", attorneyName: "Ana" }, platform).subject).toBe("Check a new attorney at Harlow & Reyes");
  });
});
