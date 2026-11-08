"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestPortalCode, signOut, verifyPortalCode } from "@/app/portal/actions";
import { useAccountSettings, type AccountSettings } from "@/components/account/use-account-settings";
import type { AccountProfile } from "@/lib/profile/types";

/** The signed-in client, resolved on the server (null when signed out). */
export type PortalAccount = AccountProfile;

/** Sign-in form state. Portal data itself is loaded by each page on the server. */
interface PortalLoginState {
  loginEmail: string;
  code: string;
}

interface PortalSessionValue {
  state: PortalLoginState;
  account: PortalAccount | null;
  /** Message from the last failed sign-in step. */
  authError: string | null;
  authPending: boolean;
  onPortalLoginEmail: (v: string) => void;
  submitPortalLogin: () => void;
  onPortalCode: (v: string) => void;
  submitPortal2fa: () => void;
  resendPortalCode: () => void;
  portalLogout: () => void;
  accountSettings: AccountSettings;
}

const PortalSessionContext = createContext<PortalSessionValue | null>(null);

export function PortalSessionProvider({
  account,
  children,
}: {
  account: PortalAccount | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<PortalLoginState>({ loginEmail: "", code: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, startAuthTransition] = useTransition();
  const accountSettings = useAccountSettings(account);

  const onPortalLoginEmail = (v: string) => setState((s) => ({ ...s, loginEmail: v }));
  const submitPortalLogin = () => {
    const email = state.loginEmail.trim();
    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }
    startAuthTransition(async () => {
      const result = await requestPortalCode(email);
      if (!result.ok) {
        setAuthError(result.error);
        return;
      }
      setAuthError(null);
      router.push("/portal/verify");
    });
  };

  const resendPortalCode = () =>
    startAuthTransition(async () => {
      const result = await requestPortalCode(state.loginEmail);
      setAuthError(result.ok ? null : result.error);
    });

  const onPortalCode = (v: string) => setState((s) => ({ ...s, code: v }));
  const submitPortal2fa = () => {
    if (!state.code.trim()) {
      setAuthError("Enter the code from your email.");
      return;
    }
    startAuthTransition(async () => {
      // Redirects into the portal on success.
      const result = await verifyPortalCode(state.loginEmail, state.code);
      setAuthError(result.ok ? null : result.error);
    });
  };

  const portalLogout = () => startAuthTransition(() => signOut());

  const value: PortalSessionValue = {
    state,
    account,
    authError,
    authPending,
    onPortalLoginEmail,
    submitPortalLogin,
    onPortalCode,
    submitPortal2fa,
    resendPortalCode,
    portalLogout,
    accountSettings,
  };

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession(): PortalSessionValue {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSession must be used within a PortalSessionProvider");
  return ctx;
}
