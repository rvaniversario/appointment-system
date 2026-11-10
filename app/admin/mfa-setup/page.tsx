"use client";

import { useEffect, useState, useTransition } from "react";
import { TwoFactorScreen } from "@/components/booking/screens/two-factor-screen";
import { confirmOperatorTotpEnrollment, startOperatorTotpEnrollment, type OperatorEnrollment } from "@/lib/admin/auth-actions";

export default function OperatorMfaSetupPage() {
  const [enrollment, setEnrollment] = useState<OperatorEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    startOperatorTotpEnrollment().then((result) => {
      if (!active) return;
      setEnrollment(result);
      if (!result.ok) setError(result.error);
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = () => {
    if (!enrollment?.ok) return;
    startTransition(async () => {
      // Redirects to the dashboard on success.
      const result = await confirmOperatorTotpEnrollment(enrollment.factorId, code);
      setError(result.ok ? null : result.error);
    });
  };

  return (
    <TwoFactorScreen
      title="Set up two-factor authentication"
      subtitle="Operator accounts must use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.). Scan the QR code, then enter the 6-digit code it shows."
      code={code}
      errorMessage={error}
      pending={pending || !enrollment?.ok}
      onCodeChange={setCode}
      onSubmit={submit}
      centered
    >
      {enrollment?.ok ? (
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          {/* Supabase returns the QR code as an SVG data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollment.qrCode}
            alt="QR code for your authenticator app"
            width={180}
            height={180}
            style={{ background: "#fff", padding: 8, borderRadius: 8 }}
          />
          <div style={{ fontSize: 12.5, color: "oklch(0.5 0.01 258)", marginTop: 8 }}>
            Can&apos;t scan? Enter this key manually:
            <div style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all", marginTop: 4 }}>
              {enrollment.secret}
            </div>
          </div>
        </div>
      ) : (
        !error && <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)" }}>Preparing your QR code…</p>
      )}
    </TwoFactorScreen>
  );
}
