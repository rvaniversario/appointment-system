"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRefund, PaymongoError } from "./paymongo";

export type RefundResult = { ok: true } | { ok: false; error: string };

/**
 * Refunds a consultation payment in full, on the firm's own PayMongo account. Partners and
 * admins only, and only for their own firm's payments. Optionally cancels the booking.
 */
export async function refundPayment(input: { paymentId: string; cancelBooking: boolean }): Promise<RefundResult> {
  const staff = await requireStaff({ manager: true });
  if (!staff.firmId || !z.guid().safeParse(input.paymentId).success) return { ok: false, error: "Payment not found." };

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .eq("firm_id", staff.firmId)
    .maybeSingle();
  if (!payment) return { ok: false, error: "Payment not found." };
  if (payment.status !== "paid" || !payment.provider_payment_id || !payment.account_id) {
    return { ok: false, error: "Only completed payments can be refunded." };
  }
  const amount = payment.amount_centavos - payment.refunded_centavos;
  if (amount < 100) return { ok: false, error: "Nothing left to refund." };

  let refund;
  try {
    refund = await createRefund({
      accountId: payment.account_id,
      paymentId: payment.provider_payment_id,
      amountCentavos: amount,
      reason: "requested_by_customer",
      notes: `Refunded by ${staff.email}`,
    });
  } catch (error) {
    const detail = error instanceof PaymongoError ? error.message : "PayMongo didn't respond.";
    console.error("[payments] refund failed", { paymentId: payment.id, detail });
    return { ok: false, error: `The refund didn't go through: ${detail}` };
  }

  const now = new Date().toISOString();
  await admin
    .from("payments")
    .update({
      status: "refunded",
      refunded_centavos: payment.amount_centavos,
      provider_refund_id: refund.id,
      refunded_at: now,
    })
    .eq("id", payment.id);
  if (payment.invoice_id) await admin.from("invoices").update({ status: "refunded" }).eq("id", payment.invoice_id);

  if (input.cancelBooking && payment.appointment_id) {
    await admin
      .from("appointments")
      .update({ status: "canceled", canceled_at: now, cancel_reason: "refunded by firm" })
      .eq("id", payment.appointment_id)
      .in("status", ["confirmed", "pending_payment", "held"]);
  }

  await admin.from("audit_log").insert({
    firm_id: staff.firmId,
    actor_id: staff.id,
    action: "payment.refunded",
    entity: "payments",
    entity_id: payment.id,
    details: { amount_centavos: amount, refund_id: refund.id, canceled_booking: input.cancelBooking },
  });

  revalidatePath("/staff/billing");
  return { ok: true };
}
