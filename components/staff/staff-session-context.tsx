"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useAccountSettings, type AccountSettings } from "@/components/account/use-account-settings";
import { getNext7Days } from "@/lib/booking/data";
import { createInitialAdminState } from "@/lib/booking/initial-state";
import { signOut } from "@/app/portal/actions";
import { staffSignIn, staffVerifyTotp, updateStaffPassword } from "@/app/staff/actions";
import type { AdminRole, AdminState, DayInfo } from "@/lib/booking/types";
import type { AccountProfile } from "@/lib/profile/types";

/** The signed-in staff member, resolved on the server (null when signed out or not MFA-verified). */
export interface StaffAccount extends AccountProfile {
  /** Dashboard role derived from the DB role: partners and admins see billing. */
  role: AdminRole;
}

interface StaffSessionValue {
  state: AdminState;
  account: StaffAccount | null;
  authError: string | null;
  authPending: boolean;
  days: DayInfo[];
  onAdminLoginEmail: (v: string) => void;
  onAdminLoginPassword: (v: string) => void;
  submitAdminLogin: () => void;
  onAdminCode: (v: string) => void;
  submitAdmin2fa: () => void;
  adminLogout: () => void;
  onAdminConflictSearch: (v: string) => void;
  setLeadReassign: (id: number, val: string) => void;
  reassignLead: (id: number) => void;
  approveLead: (id: number) => void;
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
  const [localState, setState] = useState<AdminState>(createInitialAdminState);
  // The role always comes from the server-verified account, never from client state.
  const state: AdminState = { ...localState, role: account?.role ?? "attorney" };
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, startAuthTransition] = useTransition();
  const accountSettings = useAccountSettings(account, updateStaffPassword);
  const days = getNext7Days();

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

  const onAdminConflictSearch = (v: string) => setState((s) => ({ ...s, conflictSearch: v }));
  const setLeadReassign = (id: number, val: string) =>
    setState((s) => ({
      ...s,
      queue: s.queue.map((l) => (l.id === id ? { ...l, reassignTo: val } : l)),
    }));
  const reassignLead = (id: number) =>
    setState((s) => ({
      ...s,
      queue: s.queue.map((l) =>
        l.id === id && l.reassignTo
          ? { ...l, attorneyId: l.reassignTo, conflict: false, status: "approved" as const, reassignTo: "" }
          : l
      ),
    }));
  const approveLead = (id: number) =>
    setState((s) => ({
      ...s,
      queue: s.queue.map((l) => (l.id === id ? { ...l, status: "approved" as const } : l)),
    }));

  const value: StaffSessionValue = {
    state,
    account,
    authError,
    authPending,
    days,
    onAdminLoginEmail,
    onAdminLoginPassword,
    submitAdminLogin,
    onAdminCode,
    submitAdmin2fa,
    adminLogout,
    onAdminConflictSearch,
    setLeadReassign,
    reassignLead,
    approveLead,
    accountSettings,
  };

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionValue {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) throw new Error("useStaffSession must be used within a StaffSessionProvider");
  return ctx;
}
