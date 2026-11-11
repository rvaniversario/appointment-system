"use client";

import { useState, useTransition } from "react";
import { AdminLoginScreen } from "@/components/booking/screens/admin-login-screen";
import { operatorSignIn } from "@/lib/admin/auth-actions";
import { PLATFORM } from "@/lib/brand";

export default function OperatorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <AdminLoginScreen
      title="Operator sign-in"
      intro={`For ${PLATFORM.name} operators only. Two-factor authentication is required on every sign-in.`}
      loginEmail={email}
      loginPassword={password}
      errorMessage={error}
      pending={pending}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() =>
        start(async () => {
          // Redirects to the two-factor step on success.
          const result = await operatorSignIn(email, password);
          setError(result.ok ? null : result.error);
        })
      }
    />
  );
}
