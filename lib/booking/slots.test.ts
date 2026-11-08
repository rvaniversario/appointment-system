import { describe, expect, it } from "vitest";
import { generateSlots, type SlotOptions } from "./slots";
import { formatPeso, manilaDate, manilaInstant } from "./time";

// 2026-11-09 is a Monday.
const MONDAY = "2026-11-09";
const base: SlotOptions = {
  rules: [{ weekday: 1, startTime: "09:00:00", endTime: "12:00:00" }],
  busy: [],
  durationMinutes: 30,
  fromDate: MONDAY,
  days: 1,
  now: new Date("2026-11-01T00:00:00Z"),
  leadMinutes: 120,
  stepMinutes: 30,
};
const labels = (options: Partial<SlotOptions> = {}) =>
  generateSlots({ ...base, ...options })[0].slots.map((s) => s.label);

describe("Manila time", () => {
  it("is UTC+8 with no daylight saving", () => {
    expect(manilaInstant(MONDAY, 9 * 60).toISOString()).toBe("2026-11-09T01:00:00.000Z");
    expect(manilaInstant("2026-06-15", 9 * 60).toISOString()).toBe("2026-06-15T01:00:00.000Z");
  });

  it("uses the Manila date, not the UTC date", () => {
    expect(manilaDate(new Date("2026-11-08T16:30:00Z"))).toBe(MONDAY);
    expect(manilaDate(new Date("2026-11-08T15:30:00Z"))).toBe("2026-11-08");
  });
});

describe("generateSlots", () => {
  it("lists start times that fit the consultation inside the weekly hours", () => {
    expect(labels()).toEqual(["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
    expect(labels({ durationMinutes: 60 })).toEqual(["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"]);
  });

  it("returns nothing on days without hours", () => {
    expect(labels({ fromDate: "2026-11-10" })).toEqual([]);
  });

  it("skips times that overlap busy intervals, but allows back-to-back bookings", () => {
    const busy = [{ startsAt: manilaInstant(MONDAY, 10 * 60), endsAt: manilaInstant(MONDAY, 11 * 60) }];
    expect(labels({ busy })).toEqual(["9:00 AM", "9:30 AM", "11:00 AM", "11:30 AM"]);
    expect(labels({ busy, durationMinutes: 60 })).toEqual(["9:00 AM", "11:00 AM"]);
  });

  it("respects the minimum lead time", () => {
    const now = manilaInstant(MONDAY, 8 * 60);
    expect(labels({ now })).toEqual(["10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
  });

  it("merges overlapping rules without duplicates", () => {
    const rules = [
      { weekday: 1, startTime: "09:00", endTime: "10:00" },
      { weekday: 1, startTime: "09:30", endTime: "10:30" },
    ];
    expect(labels({ rules })).toEqual(["9:00 AM", "9:30 AM", "10:00 AM"]);
  });

  it("labels each day", () => {
    const [day] = generateSlots(base);
    expect(day).toMatchObject({ date: MONDAY, dow: "Mon", day: 9, label: "Mon, Nov 9" });
  });
});

describe("formatPeso", () => {
  it("formats centavos as pesos", () => {
    expect(formatPeso(0)).toBe("₱0");
    expect(formatPeso(150000)).toBe("₱1,500");
    expect(formatPeso(12345)).toBe("₱123.45");
  });
});
