"use client";

import type { ErrorState } from "@/lib/booking/types";
import { label, portalLoginFieldStyle } from "@/lib/booking/ui";

interface PortalLoginScreenProps {
  loginEmail: string;
  loginPassword: string;
  errors: ErrorState;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
}

export function PortalLoginScreen({
  loginEmail,
  loginPassword,
  errors,
  onEmailChange,
  onPasswordChange,
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
        Log in to view appointments, message your attorney, and manage documents.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={label}>Email</label>
          <input
            type="email"
            value={loginEmail}
            onChange={(e) => onEmailChange(e.target.value)}
            style={portalLoginFieldStyle}
          />
        </div>
        <div>
          <label style={label}>Password</label>
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => onPasswordChange(e.target.value)}
            style={portalLoginFieldStyle}
          />
        </div>
        {errors.portalLogin && (
          <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
            Enter your email and password
          </div>
        )}
        <button
          onClick={onSubmit}
          style={{
            padding: "13px 0",
            border: "none",
            borderRadius: 8,
            background: "oklch(0.28 0.05 258)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          Log in
        </button>
      </div>
    </div>
  );
}
