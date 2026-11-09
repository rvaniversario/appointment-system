import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "./ics";

const event = {
  uid: "3a000000-0000-4000-8000-000000000001",
  sequence: 1_800_000_000,
  startsAt: new Date("2026-11-20T01:00:00Z"),
  endsAt: new Date("2026-11-20T01:30:00Z"),
  summary: "Initial Consultation with Atty. Reyes, Jr. (Harlow; Reyes)",
  description: "Line one\nLine two",
  location: "Makati Office, 1 Ayala Ave",
  organizerName: 'Harlow "&" Reyes',
  organizerEmail: "notifications@mail.example.com",
};

describe("buildIcs", () => {
  it("writes a calendar event in UTC with CRLF line endings", () => {
    const ics = buildIcs(event, new Date("2026-11-09T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).toContain("DTSTART:20261120T010000Z\r\n");
    expect(ics).toContain("DTEND:20261120T013000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261109T000000Z\r\n");
    expect(ics).toContain("SEQUENCE:1800000000\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("escapes text values and keeps quotes out of the organizer name", () => {
    const ics = buildIcs(event).replace(/\r\n /g, "");
    expect(ics).toContain("SUMMARY:Initial Consultation with Atty. Reyes\\, Jr. (Harlow\\; Reyes)");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
    expect(ics).toContain("LOCATION:Makati Office\\, 1 Ayala Ave");
    expect(ics).toContain('ORGANIZER;CN="Harlow & Reyes":mailto:notifications@mail.example.com');
  });

  it("marks a cancellation", () => {
    const ics = buildIcs({ ...event, canceled: true });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});

describe("escapeText", () => {
  it("escapes backslashes first", () => {
    expect(escapeText("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets without splitting multi-byte characters", () => {
    const line = `DESCRIPTION:${"ñ".repeat(80)}`;
    const parts = foldLine(line).split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(Buffer.byteLength(parts[0], "utf8")).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
});
