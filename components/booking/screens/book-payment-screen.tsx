"use client";

import { errorTextStyle, primaryButtonDisabled } from "@/lib/booking/ui";
import type { BookingSummary } from "@/lib/booking/wizard";

interface BookPaymentScreenProps {
  attorneyName: string;
  firmName: string;
  booking: BookingSummary;
  isFreeConsult: boolean;
  notice: string | null;
  pending: boolean;
  acceptsPayments: boolean;
  onConfirm: () => void;
  onPay: () => void;
}

const panel = {
  borderRadius: 10,
  padding: "16px 18px",
  fontSize: 14,
  lineHeight: 1.6,
  marginBottom: 24,
} as const;

export function BookPaymentScreen({
  attorneyName,
  firmName,
  booking,
  isFreeConsult,
  notice,
  pending,
  acceptsPayments,
  onConfirm,
  onPay,
}: BookPaymentScreenProps) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 32px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        {isFreeConsult ? "Confirm your free consultation" : "Payment"}
      </h1>
      <div
        style={{
          background: "#fff",
          border: "1px solid oklch(0.9 0.005 90)",
          borderRadius: 10,
          padding: "18px 20px",
          margin: "20px 0 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
            {booking.consultTypeLabel} with {attorneyName}
          </div>
          <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
            {booking.dateLabel} at {booking.time}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "oklch(0.28 0.05 258)" }}>{booking.priceLabel}</div>
      </div>

      {isFreeConsult ? (
        <div style={{ ...panel, background: "oklch(0.97 0.01 150)", border: "1px solid oklch(0.9 0.03 150)", color: "oklch(0.35 0.06 150)" }}>
          Nothing is due today. If you&apos;d like to pursue representation afterward, fees will be discussed
          before any charges apply.
        </div>
      ) : acceptsPayments ? (
        <div style={{ ...panel, background: "#fff", border: "1px solid oklch(0.9 0.005 90)", color: "oklch(0.4 0.01 258)" }}>
          You&apos;ll pay on PayMongo&apos;s secure checkout by card, GCash, Maya or QR Ph. Payment goes directly to{" "}
          {firmName}. Your time is held for 30 minutes while you pay, and your booking is confirmed as soon as the
          payment goes through.
        </div>
      ) : (
        <div style={{ ...panel, background: "oklch(0.97 0.03 85)", border: "1px solid oklch(0.88 0.07 85)", color: "oklch(0.38 0.06 70)" }}>
          {firmName} doesn&apos;t take online payments yet, so this consultation can&apos;t be booked online. Please
          contact the firm to book it, or go back and choose a free consultation if one is offered. The time you
          picked will be released automatically.
        </div>
      )}

      {notice && (
        <div role="alert" style={{ ...errorTextStyle, fontSize: 14, marginBottom: 8 }}>
          {notice}
        </div>
      )}

      {isFreeConsult && (
        <button disabled={pending} onClick={onConfirm} style={{ ...primaryButtonDisabled(pending), marginTop: 14 }}>
          {pending ? "Confirming…" : "Confirm free consultation"}
        </button>
      )}
      {!isFreeConsult && acceptsPayments && (
        <button disabled={pending} onClick={onPay} style={{ ...primaryButtonDisabled(pending), marginTop: 14 }}>
          {pending ? "Opening secure checkout…" : `Pay ${booking.priceLabel} securely`}
        </button>
      )}
    </div>
  );
}
