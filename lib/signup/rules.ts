/**
 * Rules for the firm signup form, shared by the form (for instant feedback) and the server
 * (which checks everything again).
 */

/** Booking pages live at /f/<slug>. Words that would confuse people or look official. */
const RESERVED = new Set([
  "admin", "api", "app", "auth", "book", "booking", "dashboard", "demo", "f", "help", "ibp", "login",
  "official", "platform", "portal", "sc", "signup", "staff", "support", "supreme-court", "test", "www",
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** "Santos & Reyes Law Office" -> "santos-reyes-law-office" */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Null if the slug can be used (availability aside), else why not. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters or numbers.`;
  if (slug.length > SLUG_MAX) return `Use at most ${SLUG_MAX} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers and single hyphens only.";
  if (RESERVED.has(slug)) return "That address is reserved. Try another.";
  return null;
}

/** IBP roll numbers are whole numbers (no letters). */
export const ROLL_NO_PATTERN = /^\d{1,6}$/;
export const FIRST_ADMISSION_YEAR = 1950;
