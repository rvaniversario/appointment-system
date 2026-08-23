"use client";

import { TwoFactorScreen } from "@/components/booking/screens/two-factor-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalVerifyPage() {
  const { state, onPortalCode, submitPortal2fa } = usePortalSession();

  return (
    <TwoFactorScreen
      title="Verify it's you"
      subtitle={`Enter the 6-digit code we sent to ${state.loginEmail}.`}
      code={state.code}
      hasError={!!state.errors.portal2fa}
      onCodeChange={onPortalCode}
      onSubmit={submitPortal2fa}
      showResend
    />
  );
}
