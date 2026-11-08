import type { ConsultMode, FirmRole } from "@/lib/supabase/database.types";

/** What firm settings pages show. Safe to send to the browser. */

export interface FirmProfileView {
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string | null;
  agreementText: string;
  cancellationCutoffHours: number;
}

export interface ConsultTypeView {
  id: string;
  label: string;
  description: string;
  mode: ConsultMode;
  durationMinutes: number;
  /** Pesos, as typed in the form ("1500" or "1500.50"). */
  pricePesos: string;
  priceLabel: string;
  isActive: boolean;
  /** Booked at least once, so it can be retired but not deleted. */
  inUse: boolean;
}

export interface OfficeView {
  id: string;
  name: string;
  address: string;
  isRemote: boolean;
  attorneyCount: number;
}

export interface AttorneyAdminView {
  id: string;
  slug: string;
  fullName: string;
  ibpRollNo: string;
  admittedYear: string;
  practiceAreas: string[];
  languages: string[];
  officeId: string;
  bio: string;
  meetingUrl: string;
  isActive: boolean;
  photoUrl: string | null;
  /** The staff account linked to this profile. */
  memberId: string | null;
  memberName: string | null;
}

export interface MemberView {
  profileId: string;
  name: string;
  email: string;
  role: FirmRole;
  attorneyName: string | null;
  isYou: boolean;
}

export interface InviteView {
  id: string;
  email: string;
  role: FirmRole;
  attorneyId: string | null;
  attorneyName: string | null;
  invitedLabel: string;
  expiresLabel: string;
  expired: boolean;
}

/** What the invite page shows a visitor holding the link. */
export type InviteLookup =
  | { state: "open"; firmName: string; email: string; role: FirmRole; hasAccount: boolean; signedInAsInvitee: boolean }
  | { state: "expired" | "used" | "invalid" };
