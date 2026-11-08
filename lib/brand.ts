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
}

export const firmBrand = (firmName: string): Brand => ({ name: firmName, tagline: "Attorneys at Law" });
