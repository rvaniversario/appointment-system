import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingFromCookie, isLiveHold } from "./session";
import { formatTimeLabel, manilaDate } from "./time";
import type { IntakeState, UploadedFile } from "./types";

/** What the wizard needs to pick a booking back up after a reload or a trip to PayMongo. */
export interface ResumedBooking {
  consultTypeId: string;
  date: string;
  startsAt: string;
  timeLabel: string;
  intake: Partial<IntakeState> | null;
  documents: UploadedFile[];
  agreementSigned: boolean;
  signature: string;
}

/** The visitor's live booking with this attorney, read through their booking cookie. */
export async function getResumableBooking(firmId: string, attorneyId: string): Promise<ResumedBooking | null> {
  const booking = await getBookingFromCookie(firmId);
  if (!booking || !isLiveHold(booking) || booking.attorney_id !== attorneyId) return null;

  const admin = createAdminClient();
  const [{ data: intake }, { data: documents }, { data: agreement }] = await Promise.all([
    admin
      .from("intakes")
      .select("first_name, last_name, email, phone, case_type, urgency, details, opposing_party, sms_opt_in")
      .eq("appointment_id", booking.id)
      .maybeSingle(),
    admin.from("documents").select("id, file_name").eq("appointment_id", booking.id).order("created_at"),
    admin.from("agreements").select("signature_name").eq("appointment_id", booking.id).maybeSingle(),
  ]);

  const startsAt = new Date(booking.starts_at);
  return {
    consultTypeId: booking.consult_type_id,
    date: manilaDate(startsAt),
    startsAt: startsAt.toISOString(),
    timeLabel: formatTimeLabel(startsAt),
    intake: intake
      ? {
          firstName: intake.first_name,
          lastName: intake.last_name,
          email: intake.email,
          phone: `0${intake.phone.slice(2)}`,
          caseType: intake.case_type,
          urgency: intake.urgency,
          details: intake.details,
          opposingParty: intake.opposing_party,
          smsOptIn: intake.sms_opt_in,
          ack: true,
          privacyConsent: true,
        }
      : null,
    documents: (documents ?? []).map((d) => ({ id: d.id, name: d.file_name })),
    agreementSigned: Boolean(agreement),
    signature: agreement?.signature_name ?? "",
  };
}
