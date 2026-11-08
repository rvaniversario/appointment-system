/** Small display helpers. All firm, booking, portal and dashboard data comes from the database. */

/** "Maria Chen" → "MC" */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
