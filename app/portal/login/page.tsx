"use client";

import { PortalLoginScreen } from "@/components/booking/screens/portal-login-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalLoginPage() {
  const { state, authError, authPending, onPortalLoginEmail, submitPortalLogin } = usePortalSession();

  return (
    <PortalLoginScreen
      loginEmail={state.loginEmail}
      errorMessage={authError}
      pending={authPending}
      onEmailChange={onPortalLoginEmail}
      onSubmit={submitPortalLogin}
    />
  );
}
