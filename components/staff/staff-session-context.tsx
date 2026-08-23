"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getNext7Days } from "@/lib/booking/data";
import { createInitialAdminState } from "@/lib/booking/initial-state";
import type { AdminRole, AdminState, DayInfo, SettingsState } from "@/lib/booking/types";

interface StaffSessionValue {
  state: AdminState;
  days: DayInfo[];
  onAdminLoginEmail: (v: string) => void;
  onAdminLoginPassword: (v: string) => void;
  submitAdminLogin: () => void;
  onAdminCode: (v: string) => void;
  submitAdmin2fa: () => void;
  adminLogout: () => void;
  onAdminRoleChange: (role: AdminRole) => void;
  onAdminConflictSearch: (v: string) => void;
  setLeadReassign: (id: number, val: string) => void;
  reassignLead: (id: number) => void;
  approveLead: (id: number) => void;
  onSettingsFieldChange: (patch: Partial<SettingsState>) => void;
  onSettingsPhotoChange: (dataUrl: string) => void;
  saveSettings: () => boolean;
}

const StaffSessionContext = createContext<StaffSessionValue | null>(null);

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AdminState>(createInitialAdminState);
  const days = getNext7Days();

  const onAdminLoginEmail = (v: string) => setState((s) => ({ ...s, loginEmail: v }));
  const onAdminLoginPassword = (v: string) => setState((s) => ({ ...s, loginPassword: v }));
  const submitAdminLogin = () => {
    if (!state.loginEmail.trim() || !state.loginPassword.trim()) {
      setState((s) => ({ ...s, errors: { adminLogin: true } }));
      return;
    }
    setState((s) => ({ ...s, errors: {} }));
    router.push("/staff/verify");
  };

  const onAdminCode = (v: string) => setState((s) => ({ ...s, code: v }));
  const submitAdmin2fa = () => {
    if (!state.code.trim()) {
      setState((s) => ({ ...s, errors: { admin2fa: true } }));
      return;
    }
    setState((s) => ({ ...s, errors: {}, loggedIn: true }));
    router.push("/staff/calendar");
  };

  const adminLogout = () => router.push("/");

  const onAdminRoleChange = (role: AdminRole) => setState((s) => ({ ...s, role }));
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

  const onSettingsFieldChange = (patch: Partial<SettingsState>) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const onSettingsPhotoChange = (dataUrl: string) =>
    setState((s) => ({ ...s, settings: { ...s.settings, photo: dataUrl } }));
  const saveSettings = (): boolean => {
    if (state.settings.password && state.settings.password !== state.settings.confirmPassword) {
      setState((s) => ({ ...s, errors: { settingsPassword: true } }));
      return false;
    }
    setState((s) => ({
      ...s,
      errors: {},
      settings: { ...s.settings, password: "", confirmPassword: "" },
    }));
    return true;
  };

  const value: StaffSessionValue = {
    state,
    days,
    onAdminLoginEmail,
    onAdminLoginPassword,
    submitAdminLogin,
    onAdminCode,
    submitAdmin2fa,
    adminLogout,
    onAdminRoleChange,
    onAdminConflictSearch,
    setLeadReassign,
    reassignLead,
    approveLead,
    onSettingsFieldChange,
    onSettingsPhotoChange,
    saveSettings,
  };

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionValue {
  const ctx = useContext(StaffSessionContext);
  if (!ctx) throw new Error("useStaffSession must be used within a StaffSessionProvider");
  return ctx;
}
