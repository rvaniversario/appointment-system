"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createInitialWizardState } from "@/lib/booking/initial-state";
import type { Attorney, IntakeState, PaymentState, WizardState } from "@/lib/booking/types";

interface WizardContextValue {
  attorney: Attorney;
  state: WizardState;
  setConsultType: (id: string) => void;
  setDate: (i: number) => void;
  setTime: (t: string) => void;
  goToIntake: () => void;
  onIntakeChange: (patch: Partial<IntakeState>) => void;
  submitIntake: () => void;
  backToDirectoryFromConflict: () => void;
  addDemoDocument: () => void;
  removeDocument: (idx: number) => void;
  goToAgreement: () => void;
  onAgreementToggle: (agreed: boolean) => void;
  onAgreementSignature: (signature: string) => void;
  submitAgreement: () => void;
  onPaymentChange: (patch: Partial<PaymentState>) => void;
  submitPayment: () => void;
  toggleCameraCheck: () => void;
  toggleMicCheck: () => void;
  finishVideoCheck: () => void;
  restart: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function BookingWizardProvider({
  attorney,
  children,
}: {
  attorney: Attorney;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(createInitialWizardState);

  const goToStep = (step: string) => router.push(`/book/${attorney.id}/${step}`);

  const setConsultType = (id: string) =>
    setState((s) => ({ ...s, booking: { ...s.booking, consultType: id } }));
  const setDate = (i: number) =>
    setState((s) => ({ ...s, booking: { ...s.booking, dateIndex: i, time: null } }));
  const setTime = (t: string) => setState((s) => ({ ...s, booking: { ...s.booking, time: t } }));
  const goToIntake = () => goToStep("intake");

  const onIntakeChange = (patch: Partial<IntakeState>) =>
    setState((s) => ({ ...s, intake: { ...s.intake, ...patch } }));

  const submitIntake = () => {
    const i = state.intake;
    const errors: WizardState["errors"] = {};
    if (!i.firstName.trim()) errors.firstName = true;
    if (!i.lastName.trim()) errors.lastName = true;
    if (!i.email.trim()) errors.email = true;
    if (!i.phone.trim()) errors.phone = true;
    if (!i.details.trim()) errors.details = true;
    if (!i.ack) errors.ack = true;
    if (Object.keys(errors).length) {
      setState((s) => ({ ...s, errors }));
      return;
    }
    const flagged = i.opposingParty.trim().toLowerCase().includes("smith");
    setState((s) => ({ ...s, errors: {}, conflictFlagged: flagged }));
    if (!flagged) goToStep("documents");
  };

  const backToDirectoryFromConflict = () => router.push("/attorneys");

  const addDemoDocument = () =>
    setState((s) => ({ ...s, documents: [...s.documents, `Document ${s.documents.length + 1}.pdf`] }));
  const removeDocument = (idx: number) =>
    setState((s) => ({ ...s, documents: s.documents.filter((_, i) => i !== idx) }));
  const goToAgreement = () => goToStep("agreement");

  const onAgreementToggle = (agreed: boolean) =>
    setState((s) => ({ ...s, agreement: { ...s.agreement, agreed } }));
  const onAgreementSignature = (signature: string) =>
    setState((s) => ({ ...s, agreement: { ...s.agreement, signature } }));
  const submitAgreement = () => {
    const a = state.agreement;
    if (!a.agreed || !a.signature.trim()) {
      setState((s) => ({ ...s, errors: { agreement: true } }));
      return;
    }
    setState((s) => ({ ...s, errors: {} }));
    goToStep("payment");
  };

  const onPaymentChange = (patch: Partial<PaymentState>) =>
    setState((s) => ({ ...s, payment: { ...s.payment, ...patch } }));
  const submitPayment = () => {
    const isFree = state.booking.consultType === "free-phone";
    if (!isFree) {
      const p = state.payment;
      if (!p.cardName.trim() || !p.cardNumber.trim() || !p.cardExpiry.trim() || !p.cardCvc.trim()) {
        setState((s) => ({ ...s, errors: { payment: true } }));
        return;
      }
    }
    setState((s) => ({ ...s, errors: {} }));
    goToStep(state.booking.consultType === "video-30" ? "video" : "confirmation");
  };

  const toggleCameraCheck = () => setState((s) => ({ ...s, cameraOk: !s.cameraOk }));
  const toggleMicCheck = () => setState((s) => ({ ...s, micOk: !s.micOk }));
  const finishVideoCheck = () => goToStep("confirmation");

  const restart = () => router.push("/attorneys");

  const value: WizardContextValue = {
    attorney,
    state,
    setConsultType,
    setDate,
    setTime,
    goToIntake,
    onIntakeChange,
    submitIntake,
    backToDirectoryFromConflict,
    addDemoDocument,
    removeDocument,
    goToAgreement,
    onAgreementToggle,
    onAgreementSignature,
    submitAgreement,
    onPaymentChange,
    submitPayment,
    toggleCameraCheck,
    toggleMicCheck,
    finishVideoCheck,
    restart,
  };

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within a BookingWizardProvider");
  return ctx;
}
