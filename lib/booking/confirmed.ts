import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPendingPayment } from "@/lib/payments/settle";
import { getBookingFromCookie } from "./session";
import { formatDateLabel, formatTimeLabel, manilaDate } from "./time";

export interface ConfirmedBooking {
  id: string;
  firstName: string;
  email: string;
  attorneyName: string;
  consultTypeLabel: string;
  mode: "phone" | "video" | "in_person";
  startsAt: string;
  endsAt: string;
  dateLabel: string;
  timeLabel: string;
  meetingUrl: string | null;
  officeAddress: string | null;
}

export type PaymentState = "none" | "processing" | "paid_but_released";

/**
 * For a booking waiting on payment, asks PayMongo directly instead of waiting for the
 * webhook, then reports what the client should see.
 */
export async function refreshBookingPayment(firmId: string): Promise<PaymentState> {
  const booking = await getBookingFromCookie(firmId);
  if (!booking) return "none";
  const admin = createAdminClient();

  if (booking.status === "pending_payment") {
    const { data: pending } = await admin
      .from("payments")
      .select("id")
      .eq("appointment_id", booking.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pending) {
      try {
        await syncPendingPayment(pending.id);
      } catch (error) {
        console.error("[payments] sync on confirmation failed", { message: (error as Error).message });
      }
    }
  }

  const [{ data: current }, { data: paid }] = await Promise.all([
    admin.from("appointments").select("status").eq("id", booking.id).single(),
    admin.from("payments").select("id").eq("appointment_id", booking.id).eq("status", "paid").limit(1).maybeSingle(),
  ]);
  if (current?.status === "pending_payment") return "processing";
  if (current?.status === "canceled" && paid) return "paid_but_released";
  return "none";
}

/** The visitor's confirmed booking at this firm, read via their booking cookie. */
export async function getConfirmedBooking(firmId: string): Promise<ConfirmedBooking | null> {
  const booking = await getBookingFromCookie(firmId);
  if (!booking || booking.status !== "confirmed") return null;

  const admin = createAdminClient();
  const [{ data: intake }, { data: attorney }, { data: consultType }] = await Promise.all([
    admin.from("intakes").select("first_name, email").eq("appointment_id", booking.id).maybeSingle(),
    admin.from("attorneys").select("full_name, office_id").eq("id", booking.attorney_id).single(),
    admin.from("consult_types").select("label, mode").eq("id", booking.consult_type_id).single(),
  ]);
  if (!attorney || !consultType) return null;

  const { data: office } =
    consultType.mode === "in_person" && attorney.office_id
      ? await admin.from("offices").select("name, address").eq("id", attorney.office_id).maybeSingle()
      : { data: null };

  const startsAt = new Date(booking.starts_at);
  return {
    id: booking.id,
    firstName: intake?.first_name ?? "",
    email: intake?.email ?? "",
    attorneyName: attorney.full_name,
    consultTypeLabel: consultType.label,
    mode: consultType.mode,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    dateLabel: formatDateLabel(manilaDate(startsAt)),
    timeLabel: formatTimeLabel(startsAt),
    meetingUrl: booking.meeting_url,
    officeAddress: office ? [office.name, office.address].filter(Boolean).join(", ") : null,
  };
}
