"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useAccountSettings, type AccountSettings } from "@/components/account/use-account-settings";
import { signOut } from "@/app/portal/actions";
import { staffSignIn, staffVerifyTotp, updateStaffPassword } from "@/app/staff/actions";
import type { AccountProfile } from "@/lib/profile/types";

export type StaffRoleLabel = "attorney" | "partner";

/** The signed-in staff member, resolved on the server (null when signed out or not MFA-verified). */
export interface StaffAccount extends AccountProfile {
  /** "partner" for partners and admins. Display only: the server checks the real role. */
  role: StaffRoleLabel;
}

/** Sign-in form state. Dashboard data is loaded by each page on the server. */
interface StaffLoginState {
  loginEmail: string;
  loginPassword: string;
  code: string;
}

interface StaffSessionValue {
  state: StaffLoginState;
  account: StaffAccount | null;
  authError: string | null;
  authPending: boolean;
  onAdminLoginEmail: (v: string) => void;
  onAdminLoginPassword: (v: string) => void;
  submitAdminLogin: () => void;
  onAdminCode: (v: string) => void;
  submitAdmin2fa: () => void;
  adminLogout: () => void;
  accountSettings: AccountSettings;
}

const StaffSessionContext = createContext<StaffSessionValue | null>(null);

export function StaffSessionProvider({
  account,
  children,
}: {
  account: StaffAccount | null;
  children: ReactNode;
}) {
  const [state, setState] = useState<StaffLoginState>({ loginEmail: "", loginPassword: "", code: "" });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, startAuthTransition] = useTransition();
  const accountSettings = useAccountSettings(account, updateStaffPassword);

  const onAdminLoginEmail = (v: string) => setState((s) => ({ ...s, loginEmail: v }));
  const onAdminLoginPassword = (v: string) => setState((s) => ({ ...s, loginPassword: v }));
  const submitAdminLogin = () => {
    if (!state.loginEmail.trim() || !state.loginPassword) {
      setAuthError("Enter your work email and password.");
      return;
    }
    startAuthTransition(async () => {
      // Redirects to two-factor verification or enrollment on success.
      const result = await staffSignIn(state.loginEmail, state.loginPassword);
      if (!result.ok) setAuthError(result.error);
      else setAuthError(null);
      setState((s) => ({ ...s, loginPassword: "" }));
    });
  };

  const onAdminCode = (v: string) => setState((s) => ({ ...s, code: v }));
  const submitAdmin2fa = () => {
    if (!state.code.trim()) {
      setAuthError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    startAuthTransition(async () => {
      const result = await staffVerifyTotp(state.code);
      setAuthError(result.ok ? null : result.error);
    });
  };

  const adminLogout = () => startAuthTransition(() => signOut());

  const value: StaffSessionValue = {
    state,
    account,
    authError,
    authPending,
    onAdminLoginEmail,
    onAdminLoginPassword,
    submitAdminLogin,
    onAdminCode,
    submitAdmin2fa,
    adminLogout,
    accountSettings,
  };

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionValue {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) throw new Error("useStaffSession must be used within a StaffSessionProvider");
  return ctx;
}
