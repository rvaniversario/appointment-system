"use client";

import { PortalLoginScreen } from "@/components/booking/screens/portal-login-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalLoginPage() {
  const { state, onPortalLoginEmail, onPortalLoginPassword, submitPortalLogin } = usePortalSession();

  return (
    <PortalLoginScreen
      loginEmail={state.loginEmail}
      loginPassword={state.loginPassword}
      errors={state.errors}
      onEmailChange={onPortalLoginEmail}
      onPasswordChange={onPortalLoginPassword}
      onSubmit={submitPortalLogin}
    />
  );
}
