"use client";

import { TwoFactorScreen } from "@/components/booking/screens/two-factor-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffVerifyPage() {
  const { state, onAdminCode, submitAdmin2fa } = useStaffSession();

  return (
    <TwoFactorScreen
      title="Verify it's you"
      subtitle="Enter the 6-digit code from your authenticator app. This step is required for all staff accounts."
      code={state.code}
      hasError={!!state.errors.admin2fa}
      onCodeChange={onAdminCode}
      onSubmit={submitAdmin2fa}
      centered
    />
  );
}
