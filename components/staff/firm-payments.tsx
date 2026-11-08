import "server-only";
import { requireStaff } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDateLabel, formatPeso, formatTimeLabel, manilaDate } from "@/lib/booking/time";
import { card } from "@/lib/booking/ui";
import { RefundButton } from "./refund-button";

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "oklch(0.45 0.09 150)" },
  refunded: { label: "Refunded", color: "oklch(0.5 0.01 258)" },
  pending: { label: "Awaiting payment", color: "oklch(0.5 0.08 70)" },
  expired: { label: "Not completed", color: "oklch(0.6 0.01 258)" },
  failed: { label: "Failed", color: "oklch(0.55 0.16 25)" },
};

/** Why a paid booking was canceled, for the "refund due" label. */
const REFUND_REASON: Record<string, string> = {
  "canceled by client": "client canceled",
  "declined by firm": "declined by firm",
};

const cell = { padding: "10px 12px", borderTop: "1px solid oklch(0.93 0.005 90)", fontSize: 13.5, verticalAlign: "top" } as const;

/** The firm's consultation payments, read with the signed-in partner's own permissions. */
export async function FirmPayments() {
  const staff = await requireStaff({ manager: true });
  const supabase = await createClient();

  const [{ data: payments }, { data: account }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, appointment_id, amount_centavos, status, failure_reason, created_at, refunded_at")
      .in("status", ["paid", "refunded", "pending"])
      .order("created_at", { ascending: false })
      .limit(50),
    // Connection status only; the webhook secret stays on the server.
    createAdminClient().from("firm_payment_accounts").select("status, livemode").eq("firm_id", staff.firmId ?? "").maybeSingle(),
  ]);

  const appointmentIds = [...new Set((payments ?? []).map((p) => p.appointment_id).filter((id): id is string => Boolean(id)))];
  const [{ data: intakes }, { data: appointments }] = await Promise.all([
    supabase.from("intakes").select("appointment_id, first_name, last_name").in("appointment_id", appointmentIds),
    supabase.from("appointments").select("id, starts_at, status, cancel_reason").in("id", appointmentIds),
  ]);
  const clientName = new Map((intakes ?? []).map((i) => [i.appointment_id, `${i.first_name} ${i.last_name}`]));
  const appointmentById = new Map((appointments ?? []).map((a) => [a.id, a]));

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 16 }}>
        <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: 22, fontWeight: 600, color: "oklch(0.25 0.01 258)", margin: 0 }}>
          Online payments
        </h2>
        <span style={{ fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
          {account?.status === "active"
            ? `PayMongo connected${account.livemode ? "" : " (test mode)"}`
            : account?.status === "invited"
              ? "PayMongo invitation sent — waiting for the firm to accept"
              : "PayMongo not connected — paid consultations can't be booked online"}
        </span>
      </div>
      <div style={{ ...card("0"), overflowX: "auto" }}>
        {(payments ?? []).length === 0 ? (
          <div style={{ padding: "18px 20px", fontSize: 14, color: "oklch(0.55 0.01 258)" }}>No online payments yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, color: "oklch(0.5 0.01 258)" }}>
                <th style={{ padding: "10px 12px" }}>Client</th>
                <th style={{ padding: "10px 12px" }}>Consultation</th>
                <th style={{ padding: "10px 12px" }}>Amount</th>
                <th style={{ padding: "10px 12px" }}>Status</th>
                <th style={{ padding: "10px 12px" }} />
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => {
                const appointment = p.appointment_id ? appointmentById.get(p.appointment_id) : undefined;
                const startsAt = appointment ? new Date(appointment.starts_at) : null;
                const needsRefund = p.status === "paid" && appointment?.status === "canceled";
                const status = STATUS[p.status] ?? { label: p.status, color: "inherit" };
                return (
                  <tr key={p.id}>
                    <td style={cell}>{(p.appointment_id && clientName.get(p.appointment_id)) || "—"}</td>
                    <td style={cell}>{startsAt ? `${formatDateLabel(manilaDate(startsAt))}, ${formatTimeLabel(startsAt)}` : "—"}</td>
                    <td style={cell}>{formatPeso(p.amount_centavos)}</td>
                    <td style={{ ...cell, color: needsRefund ? "oklch(0.55 0.16 25)" : status.color, fontWeight: 600 }}>
                      {needsRefund
                        ? `Paid, ${REFUND_REASON[appointment?.cancel_reason ?? ""] ?? "booking released"} — refund due`
                        : status.label}
                    </td>
                    <td style={{ ...cell, textAlign: "right" }}>
                      {p.status === "paid" && (
                        <RefundButton
                          paymentId={p.id}
                          amountLabel={formatPeso(p.amount_centavos)}
                          upcoming={Boolean(startsAt && startsAt > new Date() && appointment?.status === "confirmed")}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
