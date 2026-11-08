import type { AppointmentStatus, ConsultMode, InvoiceStatus } from "@/lib/supabase/database.types";

/** What the client portal shows. Safe to send to the browser. */

export interface PortalAppointment {
  id: string;
  firmName: string;
  attorneyName: string;
  consultLabel: string;
  mode: ConsultMode;
  startsAt: string;
  /** "Mon, Nov 9 · 9:00 AM" in Manila time. */
  whenLabel: string;
  durationMinutes: number;
  status: AppointmentStatus;
  upcoming: boolean;
  meetingUrl: string | null;
  officeAddress: string | null;
  /** The client may still cancel or reschedule online. */
  canChange: boolean;
  /** The firm's cutoff, for the message shown when canChange is false. */
  cutoffHours: number;
  /** A paid consultation: canceling flags the fee for a refund by the firm. */
  paid: boolean;
}

export interface PortalContact {
  attorneyId: string;
  attorneyName: string;
  firmName: string;
  threadId: string | null;
  unread: number;
}

export interface PortalMessage {
  id: string;
  mine: boolean;
  body: string;
  /** "Nov 9, 9:05 AM" in Manila time. */
  sentLabel: string;
}

export interface PortalDocument {
  id: string;
  fileName: string;
  firmName: string;
  /** "Nov 9, 2026" */
  addedLabel: string;
  sizeLabel: string;
  /** Added by the firm rather than the client. */
  fromFirm: boolean;
}

export interface PortalFirm {
  id: string;
  name: string;
}

export interface PortalInvoice {
  id: string;
  description: string;
  firmName: string;
  amountLabel: string;
  dateLabel: string;
  status: InvoiceStatus;
}
