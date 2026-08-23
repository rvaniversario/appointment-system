"use client";

import { portalLoginFieldStyle } from "@/lib/booking/ui";

interface TwoFactorScreenProps {
  title: string;
  subtitle: string;
  code: string;
  hasError: boolean;
  onCodeChange: (v: string) => void;
  onSubmit: () => void;
  showResend?: boolean;
  centered?: boolean;
}

export function TwoFactorScreen({
  title,
  subtitle,
  code,
  hasError,
  onCodeChange,
  onSubmit,
  showResend,
  centered,
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
      <input
        type="text"
        value={code}
        onChange={(e) => onCodeChange(e.target.value)}
        placeholder="123456"
        style={{
          ...portalLoginFieldStyle,
          fontSize: 20,
          letterSpacing: "0.2em",
          textAlign: "center",
          marginBottom: 6,
        }}
      />
      {hasError && (
        <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)", marginBottom: 10 }}>
          Enter the code to continue
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
          width: "100%",
          marginTop: 10,
        }}
      >
        Verify &amp; continue
      </button>
      {showResend && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button
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
