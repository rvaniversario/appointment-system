import type { AppointmentStatus, ConsultMode, ReviewStatus, Urgency } from "@/lib/supabase/database.types";

/** What the staff dashboard shows. Safe to send to the browser. */

export interface StaffAttorney {
  id: string;
  name: string;
  isActive: boolean;
  /** Our operators checked the roll number; only checked attorneys take bookings. */
  checked: boolean;
  practiceAreas: string[];
}

export interface CalendarEntry {
  id: string;
  attorneyId: string;
  /** "9:00 AM" */
  timeLabel: string;
  clientName: string;
  consultLabel: string;
  status: AppointmentStatus;
  reviewStatus: ReviewStatus;
}

export interface CalendarDay {
  date: string;
  dow: string;
  day: number;
  isToday: boolean;
}

export interface QueueItem {
  id: string;
  clientName: string;
  caseType: string;
  urgency: Urgency;
  attorneyName: string;
  whenLabel: string;
  consultLabel: string;
  conflictCount: number;
  paid: boolean;
}

export interface ConflictHitView {
  partyName: string;
  matter: string;
  matchedName: string;
  /** 0 to 100 */
  score: number;
  /** The attorney on the earlier matter, if recorded. */
  attorneyName: string | null;
}

export interface StaffDocumentView {
  id: string;
  fileName: string;
  addedLabel: string;
  sizeLabel: string;
  fromFirm: boolean;
}

export interface AppointmentDetail {
  id: string;
  clientId: string | null;
  attorneyId: string;
  attorneyName: string;
  consultLabel: string;
  mode: ConsultMode;
  whenLabel: string;
  durationMinutes: number;
  status: AppointmentStatus;
  reviewStatus: ReviewStatus;
  cancelReason: string | null;
  meetingUrl: string | null;
  /** Has it started? Outcomes can only be recorded after the start. */
  started: boolean;
  intake: {
    name: string;
    email: string;
    phone: string;
    caseType: string;
    urgency: Urgency;
    details: string;
    opposingParty: string;
    smsOptIn: boolean;
  } | null;
  conflicts: ConflictHitView[];
  documents: StaffDocumentView[];
  agreement: { signatureName: string; signedLabel: string; version: string } | null;
  payment: { amountLabel: string; status: string } | null;
  /** Other active attorneys of the firm, for reassignment. */
  reassignOptions: { id: string; name: string; matchesCaseType: boolean }[];
}

export interface ConflictPartyView {
  id: string;
  name: string;
  matter: string;
  attorneyName: string;
}

export interface StatCard {
  label: string;
  value: string;
  hint?: string;
}

export interface LoadBar {
  name: string;
  count: number;
  barPct: number;
}

export interface StaffThread {
  threadId: string;
  clientName: string;
  attorneyName: string;
  unread: number;
  lastLabel: string;
  /** ISO time of the latest message, for sorting; "" when there are none. */
  lastAt: string;
}

export interface WeeklyHour {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface TimeOff {
  id: string;
  label: string;
  reason: string;
}

export interface FeeRow {
  attorneyName: string;
  consults: number;
  collectedLabel: string;
}
