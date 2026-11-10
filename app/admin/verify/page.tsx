"use client";

import { useState, useTransition } from "react";
import { TwoFactorScreen } from "@/components/booking/screens/two-factor-screen";
import { operatorVerifyTotp } from "@/lib/admin/auth-actions";

export default function OperatorVerifyPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <TwoFactorScreen
      title="Verify it's you"
      subtitle="Enter the 6-digit code from your authenticator app."
      code={code}
      errorMessage={error}
      pending={pending}
      onCodeChange={setCode}
      onSubmit={() =>
        start(async () => {
          const result = await operatorVerifyTotp(code);
          setError(result.ok ? null : result.error);
        })
      }
      centered
    />
  );
}
