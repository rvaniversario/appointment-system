"use client";

import { useState, useTransition } from "react";
import { refundPayment } from "@/lib/payments/staff-actions";
import { errorTextStyle, secondaryButton } from "@/lib/booking/ui";

/** Two-step refund: a first click asks for confirmation, so a refund is never one stray click. */
export function RefundButton({ paymentId, amountLabel, upcoming }: { paymentId: string; amountLabel: string; upcoming: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelBooking, setCancelBooking] = useState(upcoming);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} style={{ ...secondaryButton, padding: "6px 10px", fontSize: 13 }}>
        Refund
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      {upcoming && (
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={cancelBooking} onChange={(e) => setCancelBooking(e.target.checked)} />
          Also cancel the booking
        </label>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          style={{ ...secondaryButton, padding: "6px 10px", fontSize: 13 }}
        >
          Keep
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await refundPayment({ paymentId, cancelBooking });
              if (!result.ok) setError(result.error);
            })
          }
          style={{ ...secondaryButton, padding: "6px 10px", fontSize: 13, background: "oklch(0.55 0.16 25)", color: "#fff", border: "none" }}
        >
          {pending ? "Refunding…" : `Refund ${amountLabel}`}
        </button>
      </div>
      {error && <div role="alert" style={{ ...errorTextStyle, maxWidth: 260, textAlign: "right" }}>{error}</div>}
    </div>
  );
}
