"use client";

import type { ReactNode } from "react";
import { portalLoginFieldStyle } from "@/lib/booking/ui";

interface TwoFactorScreenProps {
  title: string;
  subtitle: string;
  code: string;
  errorMessage: string | null;
  pending: boolean;
  onCodeChange: (v: string) => void;
  onSubmit: () => void;
  /** Shows a "Resend code" link (email codes only). */
  onResend?: () => void;
  /** Longest code accepted. Authenticator apps use 6; Supabase email codes can be up to 10. */
  maxCodeLength?: number;
  centered?: boolean;
  /** Extra content above the code field, e.g. an enrollment QR code. */
  children?: ReactNode;
}

export function TwoFactorScreen({
  title,
  subtitle,
  code,
  errorMessage,
  pending,
  onCodeChange,
  onSubmit,
  onResend,
  maxCodeLength = 6,
  centered,
  children,
}: TwoFactorScreenProps) {
  const body = (
    <div style={{ maxWidth: 420, width: centered ? "100%" : undefined }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>{subtitle}</p>
      {children}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="otp-code" style={{ position: "absolute", left: -9999 }}>
          Verification code
        </label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{6,${maxCodeLength}}`}
          maxLength={maxCodeLength}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          style={{
            ...portalLoginFieldStyle,
            fontSize: 20,
            letterSpacing: "0.2em",
            textAlign: "center",
            marginBottom: 6,
          }}
        />
        {errorMessage && (
          <div role="alert" style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)", marginBottom: 10 }}>
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
            width: "100%",
            marginTop: 10,
          }}
        >
          {pending ? "Verifying…" : "Verify & continue"}
        </button>
      </form>
      {onResend && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
            type="button"
            onClick={onResend}
            disabled={pending}
            style={{
              border: "none",
              background: "none",
              color: "oklch(0.5 0.08 150)",
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            Resend code
          </button>
        </div>
      )}
    </div>
  );

  if (centered) {
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
        {body}
      </div>
    );
  }

  return <div style={{ maxWidth: 420, margin: "0 auto", padding: "56px 32px 80px" }}>{body}</div>;
}
