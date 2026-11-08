import type { ConsultMode } from "@/lib/supabase/database.types";

/** What a firm's public pages and the booking wizard show. Safe to send to the browser. */
export interface PublicFirm {
  id: string;
  slug: string;
  name: string;
}

export interface PublicAttorney {
  id: string;
  slug: string;
  name: string;
  practiceAreas: string[];
  languages: string[];
  /** Office name, or "Remote / Video only". */
  location: string;
  bio: string;
  /** e.g. "IBP Roll No. 12345 · Admitted 2011". Empty when unknown. */
  credentials: string;
  photoUrl: string | null;
}

export interface ConsultTypeOption {
  id: string;
  label: string;
  description: string;
  mode: ConsultMode;
  durationMinutes: number;
  priceCentavos: number;
  /** "₱1,500", or "Free". */
  priceLabel: string;
}
