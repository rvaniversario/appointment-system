/**
 * Date and money helpers for the Philippines. Asia/Manila is UTC+8 all year (no daylight
 * saving), so a fixed offset is exact. Dates are "YYYY-MM-DD" strings in Manila time.
 */
export const MANILA_OFFSET_MINUTES = 8 * 60;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");

/** The Manila calendar date of an instant. */
export function manilaDate(instant: Date): string {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The instant of a Manila wall-clock time, e.g. ("2026-11-09", 9 * 60) for 9:00 AM. */
export function manilaInstant(date: string, minutesOfDay: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutesOfDay - MANILA_OFFSET_MINUTES));
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 0 = Sunday, matching availability_rules.weekday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}

/** "Mon, Nov 9" */
export function formatDateLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${DOW[weekdayOf(date)]}, ${MON[m - 1]} ${d}`;
}

/** "9:00 AM", in Manila time. */
export function formatTimeLabel(instant: Date): string {
  const shifted = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000);
  const h = shifted.getUTCHours();
  return `${h % 12 || 12}:${pad(shifted.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
}

/** "HH:MM" or "HH:MM:SS" (a Postgres time) to minutes after midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function dayParts(date: string): { dow: string; day: number } {
  return { dow: DOW[weekdayOf(date)], day: Number(date.slice(8, 10)) };
}

/** 150000 → "₱1,500". Money is stored as integer centavos. */
export function formatPeso(centavos: number): string {
  const pesos = centavos / 100;
  return `₱${pesos.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(pesos) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
