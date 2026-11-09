import { describe, expect, it, vi } from "vitest";
import { renderSms } from "./sms";
import type { BookingFacts } from "./templates";

vi.mock("server-only", () => ({}));
const { SmsError, smsType } = await import("./philsms");

const ctx = { firmName: "Harlow & Reyes", siteUrl: "https://app.example", now: new Date("2026-11-19T02:00:00Z") };
const facts: BookingFacts = {
  appointmentId: "3a000000-0000-4000-8000-000000000001",
  consultLabel: "Initial Consultation",
  attorneyName: "Atty. Maria Reyes",
  startsAt: "2026-11-20T01:00:00Z",
  endsAt: "2026-11-20T01:30:00Z",
  mode: "video",
  where: "https://meet.example/secret-room",
};

describe("renderSms", () => {
  it("reminds a day ahead in Manila time, with a portal link", () => {
    expect(renderSms("sms_reminder_24h", facts, ctx)).toBe(
      "Harlow & Reyes: Reminder of your consultation with Atty. Maria Reyes tomorrow, Fri, Nov 20 at 9:00 AM. Join with the link in your email. Details: https://app.example/portal/appointments",
    );
  });

  it("reminds an hour ahead", () => {
    expect(renderSms("sms_reminder_1h", { ...facts, mode: "phone", where: null }, ctx)).toBe(
      "Harlow & Reyes: Your consultation with Atty. Maria Reyes starts at 9:00 AM. The attorney will call you.",
    );
  });

  it("never includes the meeting link or the consultation type", () => {
    for (const t of ["sms_reminder_24h", "sms_reminder_1h"] as const) {
      const text = renderSms(t, facts, ctx);
      expect(text).not.toContain("secret-room");
      expect(text).not.toContain("Initial Consultation");
    }
  });

  it("shortens long firm names so a text stays short", () => {
    const text = renderSms("sms_reminder_1h", facts, { ...ctx, firmName: "A Very Long Law Office Name That Goes On And On And On" });
    expect(text.startsWith("A Very Long Law Office Name That Goes On: ")).toBe(true);
    expect(renderSms("sms_reminder_24h", facts, ctx).length).toBeLessThanOrEqual(306);
  });
});

describe("smsType", () => {
  it("sends plain text unless a character needs unicode", () => {
    expect(smsType("Harlow & Reyes: see you at 9:00 AM")).toBe("plain");
    expect(smsType("Peñafrancia Law: see you")).toBe("unicode");
  });
});

describe("SmsError.retryable", () => {
  it("retries only failures where nothing was sent", () => {
    expect(new SmsError(0, "network", true).retryable).toBe(true);
    expect(new SmsError(429, "", true).retryable).toBe(true);
    expect(new SmsError(503, "", true).retryable).toBe(true);
    expect(new SmsError(0, "timeout", false).retryable).toBe(false);
    expect(new SmsError(422, "bad number", true).retryable).toBe(false);
  });
});

describe("day-before wording", () => {
  it("says today when the consultation is later the same Manila day", () => {
    // 1:00 AM Manila on Nov 20, consultation at 9:00 PM the same day (20 hours ahead).
    const text = renderSms("sms_reminder_24h", { ...facts, startsAt: "2026-11-20T13:00:00Z" }, { ...ctx, now: new Date("2026-11-19T17:00:00Z") });
    expect(text).toContain("with Atty. Maria Reyes today, Fri, Nov 20 at 9:00 PM.");
  });
});
