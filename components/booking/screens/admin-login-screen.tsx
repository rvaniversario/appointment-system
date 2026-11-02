"use client";

import { label, portalLoginFieldStyle } from "@/lib/booking/ui";

interface AdminLoginScreenProps {
  loginEmail: string;
  loginPassword: string;
  errorMessage: string | null;
  pending: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: () => void;
}

export function AdminLoginScreen({
  loginEmail,
  loginPassword,
  errorMessage,
  pending,
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div>
            <label htmlFor="staff-email" style={label}>
              Work email
            </label>
            <input
              id="staff-email"
              type="email"
              autoComplete="username"
              required
              value={loginEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              style={portalLoginFieldStyle}
            />
          </div>
          <div>
            <label htmlFor="staff-password" style={label}>
              Password
            </label>
            <input
              id="staff-password"
              type="password"
              autoComplete="current-password"
              required
              value={loginPassword}
              onChange={(e) => onPasswordChange(e.target.value)}
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
            {pending ? "Signing in…" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
