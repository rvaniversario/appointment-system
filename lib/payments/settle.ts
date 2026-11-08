import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { expireCheckoutSession, getCheckoutSession } from "./paymongo";

/** How long a client has to finish paying before their time is released. */
export const CHECKOUT_MINUTES = 30;

type Admin = ReturnType<typeof createAdminClient>;

async function audit(admin: Admin, firmId: string, action: string, entityId: string, details: { [key: string]: Json }) {
  await admin.from("audit_log").insert({ firm_id: firmId, action, entity: "payments", entity_id: entityId, details });
}

export type SettleOutcome = "confirmed" | "already_settled" | "needs_refund" | "amount_mismatch" | "not_found";

/**
 * Records a successful payment and confirms its booking. Safe to call more than once, and
 * from both the webhook and reconciliation: only the first call for a payment does anything.
 */
export async function settlePaidPayment(input: {
  paymentRowId: string;
  providerPaymentId: string;
  amountCentavos: number;
}): Promise<SettleOutcome> {
  const admin = createAdminClient();

  // Claim the payment. Only one caller gets the row back.
  const { data: payment } = await admin
    .from("payments")
    .update({ status: "paid", provider_payment_id: input.providerPaymentId, failure_reason: null })
    .eq("id", input.paymentRowId)
    .in("status", ["pending", "expired", "failed"])
    .select("*")
    .maybeSingle();
  if (!payment) {
    const { count } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("id", input.paymentRowId);
    return count ? "already_settled" : "not_found";
  }

  if (input.amountCentavos !== payment.amount_centavos) {
    await admin.from("payments").update({ failure_reason: "amount mismatch" }).eq("id", payment.id);
    await audit(admin, payment.firm_id, "payment.amount_mismatch", payment.id, {
      expected: payment.amount_centavos,
      received: input.amountCentavos,
    });
    return "amount_mismatch";
  }

  const { data: appointment } = await admin
    .from("appointments")
    .select("id, consult_type_id, attorney_id, client_id, status")
    .eq("id", payment.appointment_id ?? "")
    .maybeSingle();
  const [{ data: consultType }, { data: attorney }] = await Promise.all([
    admin.from("consult_types").select("label, mode").eq("id", appointment?.consult_type_id ?? "").maybeSingle(),
    admin.from("attorneys").select("meeting_url").eq("id", appointment?.attorney_id ?? "").maybeSingle(),
  ]);

  const { data: invoice } = await admin
    .from("invoices")
    .insert({
      firm_id: payment.firm_id,
      client_id: payment.client_id ?? appointment?.client_id ?? "",
      appointment_id: payment.appointment_id,
      description: consultType?.label ?? "Consultation",
      amount_centavos: payment.amount_centavos,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (invoice) await admin.from("payments").update({ invoice_id: invoice.id }).eq("id", payment.id);

  // Confirm the booking. A hold that lapsed while the client was paying is revived if the
  // time is still free; the no-overlap constraint rejects it if someone else took it.
  const { data: confirmed, error } = appointment
    ? await admin
        .from("appointments")
        .update({
          status: "confirmed",
          hold_expires_at: null,
          canceled_at: null,
          cancel_reason: null,
          meeting_url: consultType?.mode === "video" ? (attorney?.meeting_url ?? null) : null,
        })
        .eq("id", appointment.id)
        .in("status", ["held", "pending_payment", "canceled"])
        .select("id")
        .maybeSingle()
    : { data: null, error: null };

  if (confirmed) {
    await audit(admin, payment.firm_id, "payment.confirmed_booking", payment.id, { appointment_id: appointment?.id ?? null });
    return "confirmed";
  }
  if (appointment?.status === "confirmed") return "confirmed";

  await admin.from("payments").update({ failure_reason: "paid after the time was released" }).eq("id", payment.id);
  await audit(admin, payment.firm_id, "payment.needs_refund", payment.id, {
    appointment_id: appointment?.id ?? null,
    reason: error?.code === "23P01" ? "time was booked by someone else" : "booking no longer exists",
  });
  return "needs_refund";
}

/**
 * Brings one pending payment up to date with PayMongo: settles it if paid, or releases the
 * time if the client ran out of time. Used by the confirmation page and the daily check,
 * because PayMongo doesn't resend webhooks that were missed.
 */
export async function syncPendingPayment(paymentRowId: string): Promise<SettleOutcome | "pending" | "expired"> {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("*").eq("id", paymentRowId).maybeSingle();
  if (!payment || payment.status !== "pending" || !payment.provider_checkout_id || !payment.account_id) {
    return payment ? "already_settled" : "not_found";
  }

  const session = await getCheckoutSession(payment.account_id, payment.provider_checkout_id);
  if (session.paid) {
    return settlePaidPayment({
      paymentRowId: payment.id,
      providerPaymentId: session.paid.paymentId,
      amountCentavos: session.paid.amountCentavos,
    });
  }

  const deadline = new Date(payment.created_at).getTime() + CHECKOUT_MINUTES * 60_000;
  if (Date.now() < deadline) return "pending";

  await expireCheckoutSession(payment.account_id, payment.provider_checkout_id);
  await admin.from("payments").update({ status: "expired" }).eq("id", payment.id).eq("status", "pending");
  if (payment.appointment_id) {
    await admin
      .from("appointments")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "payment not completed" })
      .eq("id", payment.appointment_id)
      .eq("status", "pending_payment");
  }
  return "expired";
}
