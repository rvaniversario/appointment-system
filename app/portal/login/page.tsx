"use client";

import { useSearchParams } from "next/navigation";
import { PortalLoginScreen } from "@/components/booking/screens/portal-login-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalLoginPage() {
  const linkFailed = useSearchParams().get("error") === "link";
  const { state, authError, authPending, onPortalLoginEmail, submitPortalLogin } = usePortalSession();

  return (
    <PortalLoginScreen
      loginEmail={state.loginEmail}
      errorMessage={authError ?? (linkFailed ? "That sign-in link is invalid or has expired. Request a new code." : null)}
      pending={authPending}
      onEmailChange={onPortalLoginEmail}
      onSubmit={submitPortalLogin}
    />
  );
}
