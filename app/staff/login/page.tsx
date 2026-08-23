"use client";

import { AdminLoginScreen } from "@/components/booking/screens/admin-login-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffLoginPage() {
  const { state, onAdminLoginEmail, onAdminLoginPassword, submitAdminLogin } = useStaffSession();

  return (
    <AdminLoginScreen
      loginEmail={state.loginEmail}
      loginPassword={state.loginPassword}
      errors={state.errors}
      onEmailChange={onAdminLoginEmail}
      onPasswordChange={onAdminLoginPassword}
      onSubmit={submitAdminLogin}
    />
  );
}
