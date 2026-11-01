"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TwoFactorScreen } from "@/components/booking/screens/two-factor-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalVerifyPage() {
  const router = useRouter();
  const { state, authError, authPending, onPortalCode, submitPortal2fa, resendPortalCode } =
    usePortalSession();

  // The email lives in client state; after a reload start over from the login page.
  useEffect(() => {
    if (!state.loginEmail) router.replace("/portal/login");
  }, [state.loginEmail, router]);

  return (
    <TwoFactorScreen
      title="Verify it's you"
      subtitle={`If ${state.loginEmail} has a client account, we've sent it a 6-digit code. It expires in 10 minutes.`}
      code={state.code}
      errorMessage={authError}
      pending={authPending}
      onCodeChange={onPortalCode}
      onSubmit={submitPortal2fa}
      onResend={resendPortalCode}
    />
  );
}
