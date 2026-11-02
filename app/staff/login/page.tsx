"use client";

import { AdminLoginScreen } from "@/components/booking/screens/admin-login-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffLoginPage() {
  const { state, authError, authPending, onAdminLoginEmail, onAdminLoginPassword, submitAdminLogin } =
    useStaffSession();

  return (
    <AdminLoginScreen
      loginEmail={state.loginEmail}
      loginPassword={state.loginPassword}
      errorMessage={authError}
      pending={authPending}
      onEmailChange={onAdminLoginEmail}
      onPasswordChange={onAdminLoginPassword}
      onSubmit={submitAdminLogin}
    />
  );
}
