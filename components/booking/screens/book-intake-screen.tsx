"use client";

import type { ErrorState, IntakeState, Urgency } from "@/lib/booking/types";
import { errorTextStyle, fieldStyle, label, primaryButtonDisabled } from "@/lib/booking/ui";

interface BookIntakeScreenProps {
  firmName: string;
  caseTypes: string[];
  intake: IntakeState;
  errors: ErrorState;
  notice: string | null;
  pending: boolean;
  onIntakeChange: (patch: Partial<IntakeState>) => void;
  onSubmit: () => void;
}

const checkboxRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 13.5,
  color: "oklch(0.4 0.01 258)",
  cursor: "pointer",
} as const;

const urgencyOptions: { key: Urgency; label: string }[] = [
  { key: "standard", label: "Standard" },
  { key: "urgent", label: "Urgent" },
];

export function BookIntakeScreen({
  firmName,
  caseTypes,
  intake,
  errors,
  notice,
  pending,
  onIntakeChange,
  onSubmit,
}: BookIntakeScreenProps) {
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
        Tell us about your situation
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 8px" }}>
        This information is encrypted and only visible to {firmName} staff and attorneys.
      </p>

      {notice && (
        <div role="alert" style={{ ...errorTextStyle, fontSize: 14, margin: "16px 0 0" }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={label}>First name</label>
              <input
                type="text"
                value={intake.firstName}
                onChange={(e) => onIntakeChange({ firstName: e.target.value })}
                style={fieldStyle(errors.firstName)}
              />
              {errors.firstName && <div style={errorTextStyle}>Required</div>}
            </div>
            <div>
              <label style={label}>Last name</label>
              <input
                type="text"
                value={intake.lastName}
                onChange={(e) => onIntakeChange({ lastName: e.target.value })}
                style={fieldStyle(errors.lastName)}
              />
              {errors.lastName && <div style={errorTextStyle}>Required</div>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={label}>Email</label>
              <input
                type="email"
                value={intake.email}
                onChange={(e) => onIntakeChange({ email: e.target.value })}
                style={fieldStyle(errors.email)}
              />
              {errors.email && <div style={errorTextStyle}>Enter a valid email address</div>}
            </div>
            <div>
              <label style={label}>Mobile number</label>
              <input
                type="tel"
                placeholder="0917 123 4567"
                autoComplete="tel"
                value={intake.phone}
                onChange={(e) => onIntakeChange({ phone: e.target.value })}
                style={fieldStyle(errors.phone)}
              />
              {errors.phone && <div style={errorTextStyle}>Enter a Philippine mobile number</div>}
            </div>
          </div>
          <div>
            <label style={label}>Case type</label>
            <select
              value={intake.caseType}
              onChange={(e) => onIntakeChange({ caseType: e.target.value })}
              style={{ ...fieldStyle(errors.caseType), background: "#fff" }}
            >
              <option value="" disabled>
                Choose one
              </option>
              {caseTypes.map((pa) => (
                <option key={pa} value={pa}>
                  {pa}
                </option>
              ))}
            </select>
            {errors.caseType && <div style={errorTextStyle}>Required</div>}
          </div>
          <div>
            <label style={label}>How urgent is this?</label>
            <div style={{ display: "flex", gap: 10 }}>
              {urgencyOptions.map((u) => {
                const sel = intake.urgency === u.key;
                return (
                  <div
                    key={u.key}
                    onClick={() => onIntakeChange({ urgency: u.key })}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 7,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                      color: sel ? "#fff" : "oklch(0.4 0.01 258)",
                      border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.85 0.005 90)"}`,
                    }}
                  >
                    {u.label}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label style={label}>Briefly describe your situation</label>
            <textarea
              value={intake.details}
              onChange={(e) => onIntakeChange({ details: e.target.value })}
              rows={4}
              style={{ ...fieldStyle(errors.details), resize: "vertical" }}
            />
            {errors.details && <div style={errorTextStyle}>Required</div>}
          </div>
          <div>
            <label style={label}>Opposing party name (if any)</label>
            <input
              type="text"
              value={intake.opposingParty}
              onChange={(e) => onIntakeChange({ opposingParty: e.target.value })}
              style={{
                padding: "10px 12px",
                border: "1px solid oklch(0.85 0.005 90)",
                borderRadius: 7,
                fontSize: 14,
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 4 }}>
              This helps us check for conflicts of interest. It is never shared with the other
              party.
            </div>
          </div>
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={intake.ack}
              onChange={(e) => onIntakeChange({ ack: e.target.checked })}
              style={{ marginTop: 2 }}
            />
            I understand this consultation does not yet establish an attorney-client
            relationship.
          </label>
          {errors.ack && <div style={errorTextStyle}>Please confirm this to continue</div>}
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={intake.privacyConsent}
              onChange={(e) => onIntakeChange({ privacyConsent: e.target.checked })}
              style={{ marginTop: 2 }}
            />
            I consent to {firmName} collecting and processing my personal information to evaluate
            my matter and schedule this consultation, under the Data Privacy Act of 2012 (RA 10173).
          </label>
          {errors.privacyConsent && <div style={errorTextStyle}>Your consent is needed to book online</div>}
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={intake.smsOptIn}
              onChange={(e) => onIntakeChange({ smsOptIn: e.target.checked })}
              style={{ marginTop: 2 }}
            />
            Send me appointment reminders by text message (optional).
          </label>

          <button disabled={pending} onClick={onSubmit} style={primaryButtonDisabled(pending)}>
            {pending ? "Saving…" : "Continue →"}
          </button>
      </div>
    </div>
  );
}
