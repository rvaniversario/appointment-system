"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestPortalCode, signOut, verifyPortalCode } from "@/app/portal/actions";
import { useAccountSettings, type AccountSettings } from "@/components/account/use-account-settings";
import { getAttorney, getNext7Days } from "@/lib/booking/data";
import { createInitialPortalState } from "@/lib/booking/initial-state";
import type { DayInfo, PortalState } from "@/lib/booking/types";
import type { AccountProfile } from "@/lib/profile/types";

/** The signed-in client, resolved on the server (null when signed out). */
export type PortalAccount = AccountProfile;

interface PortalSessionValue {
  state: PortalState;
  account: PortalAccount | null;
  /** Message from the last failed sign-in step. */
  authError: string | null;
  authPending: boolean;
  days: DayInfo[];
  messagingAttorneyName: string;
  onPortalLoginEmail: (v: string) => void;
  submitPortalLogin: () => void;
  onPortalCode: (v: string) => void;
  submitPortal2fa: () => void;
  resendPortalCode: () => void;
  portalLogout: () => void;
  startReschedule: (id: number) => void;
  cancelRescheduleUI: () => void;
  setRescheduleDate: (i: number) => void;
  setRescheduleTime: (t: string) => void;
  confirmReschedule: (id: number) => void;
  cancelAppointment: (id: number) => void;
  onPortalMessageDraft: (v: string) => void;
  sendPortalMessage: () => void;
  addPortalDocument: () => void;
  payInvoice: (id: number) => void;
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
  const [state, setState] = useState<PortalState>(createInitialPortalState);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, startAuthTransition] = useTransition();
  const accountSettings = useAccountSettings(account);
  const days = getNext7Days();

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

  const startReschedule = (id: number) =>
    setState((s) => ({ ...s, rescheduleId: id, rescheduleDateIndex: null, rescheduleTime: null }));
  const cancelRescheduleUI = () =>
    setState((s) => ({ ...s, rescheduleId: null, rescheduleDateIndex: null, rescheduleTime: null }));
  const setRescheduleDate = (i: number) =>
    setState((s) => ({ ...s, rescheduleDateIndex: i, rescheduleTime: null }));
  const setRescheduleTime = (t: string) => setState((s) => ({ ...s, rescheduleTime: t }));
  const confirmReschedule = (id: number) =>
    setState((s) => {
      const dateLabel = s.rescheduleDateIndex != null ? days[s.rescheduleDateIndex].label : "";
      return {
        ...s,
        rescheduleId: null,
        rescheduleDateIndex: null,
        rescheduleTime: null,
        appointments: s.appointments.map((a) =>
          a.id === id ? { ...a, dateLabel: dateLabel || a.dateLabel, time: s.rescheduleTime || a.time } : a
        ),
      };
    });
  const cancelAppointment = (id: number) =>
    setState((s) => ({
      ...s,
      appointments: s.appointments.map((a) => (a.id === id ? { ...a, status: "canceled" as const } : a)),
    }));

  const onPortalMessageDraft = (v: string) => setState((s) => ({ ...s, messageDraft: v }));
  const sendPortalMessage = () => {
    const draft = state.messageDraft.trim();
    if (!draft) return;
    setState((s) => ({
      ...s,
      messageDraft: "",
      messages: [...s.messages, { from: "client" as const, text: draft }],
    }));
  };

  const addPortalDocument = () =>
    setState((s) => ({ ...s, documents: [...s.documents, { name: `Document ${s.documents.length + 1}.pdf` }] }));
  const payInvoice = (id: number) =>
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, status: "paid" as const } : inv)),
    }));

  const messagingAttorneyName = getAttorney(state.appointments[0]?.attorneyId)?.name ?? "";

  const value: PortalSessionValue = {
    state,
    account,
    authError,
    authPending,
    days,
    messagingAttorneyName,
    onPortalLoginEmail,
    submitPortalLogin,
    onPortalCode,
    submitPortal2fa,
    resendPortalCode,
    portalLogout,
    startReschedule,
    cancelRescheduleUI,
    setRescheduleDate,
    setRescheduleTime,
    confirmReschedule,
    cancelAppointment,
    onPortalMessageDraft,
    sendPortalMessage,
    addPortalDocument,
    payInvoice,
    accountSettings,
  };

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession(): PortalSessionValue {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSession must be used within a PortalSessionProvider");
  return ctx;
}
