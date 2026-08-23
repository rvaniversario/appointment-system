"use client";

import type { AgreementState, ErrorState } from "@/lib/booking/types";
import { primaryButton } from "@/lib/booking/ui";

interface BookAgreementScreenProps {
  attorneyName: string;
  agreement: AgreementState;
  errors: ErrorState;
  onToggle: (agreed: boolean) => void;
  onSignatureChange: (signature: string) => void;
  onSubmit: () => void;
}

export function BookAgreementScreen({
  attorneyName,
  agreement,
  errors,
  onToggle,
  onSignatureChange,
  onSubmit,
}: BookAgreementScreenProps) {
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
        Review &amp; sign consultation agreement
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 20px" }}>
        Please review before your consultation with {attorneyName}.
      </p>

      <div
        style={{
          background: "#fff",
          border: "1px solid oklch(0.9 0.005 90)",
          borderRadius: 10,
          padding: "22px 24px",
          maxHeight: 220,
          overflowY: "auto",
          fontSize: 14,
          lineHeight: 1.7,
          color: "oklch(0.4 0.01 258)",
          marginBottom: 24,
        }}
      >
        <p>
          This Consultation Agreement confirms that you have scheduled a paid or complimentary
          consultation with Harlow &amp; Reyes to discuss the matter described in your intake
          form. This consultation is for the purpose of evaluating your legal situation and does
          not, by itself, create an attorney-client relationship or establish representation.
        </p>
        <p>
          Any information you share during the consultation will be treated as confidential in
          accordance with applicable rules of professional conduct. If the firm agrees to
          represent you following the consultation, a separate engagement letter outlining scope,
          fees, and terms of representation will be provided for your signature.
        </p>
        <p>You may cancel or reschedule this consultation up to 24 hours in advance without charge.</p>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          fontSize: 13.5,
          color: "oklch(0.4 0.01 258)",
          cursor: "pointer",
          marginBottom: 18,
        }}
      >
        <input
          type="checkbox"
          checked={agreement.agreed}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        I have read and agree to the terms above.
      </label>

      <label
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "oklch(0.4 0.01 258)",
          display: "block",
          marginBottom: 6,
        }}
      >
        Type your full name to sign
      </label>
      <input
        type="text"
        value={agreement.signature}
        onChange={(e) => onSignatureChange(e.target.value)}
        placeholder="Full legal name"
        style={{
          padding: "12px 14px",
          border: "1px solid oklch(0.85 0.005 90)",
          borderRadius: 7,
          fontSize: 16,
          fontFamily: "var(--font-lora), serif",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 6,
        }}
      />
      {errors.agreement && (
        <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)", marginBottom: 14 }}>
          Please check the box and type your name to sign
        </div>
      )}

      <button onClick={onSubmit} style={{ ...primaryButton, width: "100%", marginTop: 14 }}>
        Continue to payment →
      </button>
    </div>
  );
}
