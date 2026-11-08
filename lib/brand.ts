/**
 * The product's own name, shown wherever no single firm is in context: the home page,
 * client portal, staff sign-in and browser titles. A placeholder until a name is chosen.
 */
export const PLATFORM = {
  name: "Consult Booking",
  tagline: "For Philippine law firms",
} as const;

export interface Brand {
  name: string;
  tagline: string;
  /** The firm's uploaded logo, shown in place of the default mark. */
  logoUrl?: string | null;
}

export const firmBrand = (firm: { name: string; logoUrl?: string | null }): Brand => ({
  name: firm.name,
  tagline: "Attorneys at Law",
  logoUrl: firm.logoUrl ?? null,
});
