"use client";

import type { ErrorState, PaymentState } from "@/lib/booking/types";
import { primaryButton } from "@/lib/booking/ui";

interface BookingSummary {
  consultTypeLabel: string;
  priceLabel: string;
  dateLabel: string;
  time: string;
}

interface BookPaymentScreenProps {
  attorneyName: string;
  booking: BookingSummary;
  payment: PaymentState;
  errors: ErrorState;
  isFreeConsult: boolean;
  onPaymentChange: (patch: Partial<PaymentState>) => void;
  onSubmit: () => void;
}

const cardFieldStyle = {
  padding: "11px 12px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
} as const;

export function BookPaymentScreen({
  attorneyName,
  booking,
  payment,
  errors,
  isFreeConsult,
  onPaymentChange,
  onSubmit,
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
        {isFreeConsult ? "Confirm your free consultation" : "Complete payment"}
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
        <div style={{ fontSize: 20, fontWeight: 700, color: "oklch(0.28 0.05 258)" }}>
          {booking.priceLabel}
        </div>
      </div>

      {isFreeConsult && (
        <div
          style={{
            background: "oklch(0.97 0.01 150)",
            border: "1px solid oklch(0.9 0.03 150)",
            borderRadius: 10,
            padding: "16px 18px",
            fontSize: 14,
            color: "oklch(0.35 0.06 150)",
            marginBottom: 24,
          }}
        >
          Nothing is due today. If you&apos;d like to pursue representation afterward, fees will
          be discussed before any charges apply.
        </div>
      )}

      {!isFreeConsult && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 8 }}>
          <div>
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "oklch(0.4 0.01 258)",
                display: "block",
                marginBottom: 6,
              }}
            >
              Name on card
            </label>
            <input
              type="text"
              value={payment.cardName}
              onChange={(e) => onPaymentChange({ cardName: e.target.value })}
              style={cardFieldStyle}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(0.4 0.01 258)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Card number
              </label>
              <input
                type="text"
                value={payment.cardNumber}
                onChange={(e) => onPaymentChange({ cardNumber: e.target.value })}
                placeholder="4242 4242 4242 4242"
                style={cardFieldStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(0.4 0.01 258)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Expiry
              </label>
              <input
                type="text"
                value={payment.cardExpiry}
                onChange={(e) => onPaymentChange({ cardExpiry: e.target.value })}
                placeholder="MM/YY"
                style={cardFieldStyle}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "oklch(0.4 0.01 258)",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                CVC
              </label>
              <input
                type="text"
                value={payment.cardCvc}
                onChange={(e) => onPaymentChange({ cardCvc: e.target.value })}
                placeholder="123"
                style={cardFieldStyle}
              />
            </div>
          </div>
          {errors.payment && (
            <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
              Please complete all card fields
            </div>
          )}
        </div>
      )}

      <button onClick={onSubmit} style={{ ...primaryButton, width: "100%", marginTop: 14 }}>
        {isFreeConsult ? "Confirm free consultation" : "Pay & confirm booking"}
      </button>
    </div>
  );
}
