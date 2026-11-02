"use client";

import { label, portalLoginFieldStyle } from "@/lib/booking/ui";

interface PortalLoginScreenProps {
  loginEmail: string;
  errorMessage: string | null;
  pending: boolean;
  onEmailChange: (v: string) => void;
  onSubmit: () => void;
}

export function PortalLoginScreen({
  loginEmail,
  errorMessage,
  pending,
  onEmailChange,
  onSubmit,
}: PortalLoginScreenProps) {
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "56px 32px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        Client Portal
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>
        Log in to view appointments, message your attorney, and manage documents. We&apos;ll
        email you a sign-in code.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div>
          <label htmlFor="portal-email" style={label}>
            Email
          </label>
          <input
            id="portal-email"
            type="email"
            autoComplete="email"
            required
            value={loginEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            style={portalLoginFieldStyle}
          />
        </div>
        {errorMessage && (
          <div role="alert" style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
            {errorMessage}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "13px 0",
            border: "none",
            borderRadius: 8,
            background: "oklch(0.28 0.05 258)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
            marginTop: 6,
          }}
        >
          {pending ? "Sending code…" : "Email me a code"}
        </button>
      </form>
    </div>
  );
}
