"use client";

import type { ErrorState } from "@/lib/booking/types";
import { label, portalLoginFieldStyle } from "@/lib/booking/ui";

interface AdminLoginScreenProps {
  loginEmail: string;
  loginPassword: string;
  errors: ErrorState;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
}

export function AdminLoginScreen({
  loginEmail,
  loginPassword,
  errors,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AdminLoginScreenProps) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 200px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora), serif",
            fontSize: 26,
            fontWeight: 600,
            color: "oklch(0.25 0.01 258)",
            margin: "0 0 6px",
          }}
        >
          Staff Login
        </h1>
        <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>
          For attorneys and firm staff only. Two-factor authentication is required on every
          login.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={label}>Work email</label>
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
          {errors.adminLogin && (
            <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
              Enter your work email and password
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
          <div
            style={{
              textAlign: "center",
              fontSize: 12.5,
              color: "oklch(0.6 0.01 258)",
              marginTop: 4,
            }}
          >
            Or continue with SSO (Google Workspace / Microsoft 365)
          </div>
        </div>
      </div>
    </div>
  );
}
