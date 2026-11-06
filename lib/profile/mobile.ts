/**
 * Converts a Philippine mobile number as people type it (0917 123 4567, +63 917 123 4567,
 * 9171234567) to the format stored in profiles.mobile (639XXXXXXXXX). Null if it isn't one.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().+]/g, "");
  const match = /^(?:63|0)?(9\d{9})$/.exec(digits);
  return match ? `63${match[1]}` : null;
}

/** Stored format to the local format shown in forms. */
export function formatMobile(stored: string | null): string {
  return stored ? `0${stored.slice(2)}` : "";
}
