"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAttorney, getNext7Days } from "@/lib/booking/data";
import { createInitialPortalState } from "@/lib/booking/initial-state";
import type { DayInfo, PortalState, SettingsState } from "@/lib/booking/types";

interface PortalSessionValue {
  state: PortalState;
  days: DayInfo[];
  messagingAttorneyName: string;
  onPortalLoginEmail: (v: string) => void;
  onPortalLoginPassword: (v: string) => void;
  submitPortalLogin: () => void;
  onPortalCode: (v: string) => void;
  submitPortal2fa: () => void;
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
  onSettingsFieldChange: (patch: Partial<SettingsState>) => void;
  onSettingsPhotoChange: (dataUrl: string) => void;
  /** Reads current state synchronously and returns whether the save succeeded. */
  saveSettings: () => boolean;
}

const PortalSessionContext = createContext<PortalSessionValue | null>(null);

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<PortalState>(createInitialPortalState);
  const days = getNext7Days();

  const onPortalLoginEmail = (v: string) => setState((s) => ({ ...s, loginEmail: v }));
  const onPortalLoginPassword = (v: string) => setState((s) => ({ ...s, loginPassword: v }));
  const submitPortalLogin = () => {
    if (!state.loginEmail.trim() || !state.loginPassword.trim()) {
      setState((s) => ({ ...s, errors: { portalLogin: true } }));
      return;
    }
    setState((s) => ({ ...s, errors: {} }));
    router.push("/portal/verify");
  };

  const onPortalCode = (v: string) => setState((s) => ({ ...s, code: v }));
  const submitPortal2fa = () => {
    if (!state.code.trim()) {
      setState((s) => ({ ...s, errors: { portal2fa: true } }));
      return;
    }
    setState((s) => ({ ...s, errors: {}, loggedIn: true }));
    router.push("/portal/appointments");
  };

  const portalLogout = () => router.push("/");

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

  const messagingAttorneyName = getAttorney(state.appointments[0]?.attorneyId)?.name ?? "";

  const value: PortalSessionValue = {
    state,
    days,
    messagingAttorneyName,
    onPortalLoginEmail,
    onPortalLoginPassword,
    submitPortalLogin,
    onPortalCode,
    submitPortal2fa,
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
    onSettingsFieldChange,
    onSettingsPhotoChange,
    saveSettings,
  };

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession(): PortalSessionValue {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) throw new Error("usePortalSession must be used within a PortalSessionProvider");
  return ctx;
}
