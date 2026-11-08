"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  startCheckout,
  confirmFreeBooking,
  confirmUpload,
  createUploadUrl,
  holdSlot,
  loadSlots,
  removeUpload,
  signAgreement,
  submitIntake as submitIntakeAction,
} from "@/lib/booking/actions";
import { createInitialWizardState } from "@/lib/booking/initial-state";
import type { ConsultTypeOption, PublicAttorney, PublicFirm } from "@/lib/booking/public-types";
import type { SlotPageData } from "@/lib/booking/queries";
import type { ResumedBooking } from "@/lib/booking/resume";
import type { DaySlots } from "@/lib/booking/slots";
import type { ErrorKey, IntakeState, WizardState } from "@/lib/booking/types";

export interface SlotPage {
  fromDate: string | null;
  days: DaySlots[];
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

interface WizardContextValue {
  firm: PublicFirm;
  attorney: PublicAttorney;
  consultTypes: ConsultTypeOption[];
  agreementParagraphs: string[];
  /** Intake case types: the attorney's practice areas, plus "Other". */
  caseTypes: string[];
  state: WizardState;
  slots: SlotPage;
  selectedConsultType: ConsultTypeOption | undefined;
  basePath: string;
  /** The firm can take online payments, so paid consultations can be booked. */
  acceptsPayments: boolean;
  setConsultType: (id: string) => void;
  showWeek: (direction: "back" | "forward") => void;
  setDate: (date: string) => void;
  setTime: (startsAt: string, label: string) => void;
  goToIntake: () => void;
  onIntakeChange: (patch: Partial<IntakeState>) => void;
  submitIntake: () => void;
  uploadFiles: (files: FileList) => void;
  removeDocument: (id: string) => void;
  goToAgreement: () => void;
  onAgreementToggle: (agreed: boolean) => void;
  onAgreementSignature: (signature: string) => void;
  submitAgreement: () => void;
  confirmBooking: () => void;
  payNow: () => void;
  toggleCameraCheck: () => void;
  toggleMicCheck: () => void;
  finishVideoCheck: () => void;
  restart: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

const BUCKET = "client-documents";
const EMPTY_SLOTS: SlotPage = { fromDate: null, days: [], canGoBack: false, canGoForward: false, loading: false };

export function BookingWizardProvider({
  firm,
  attorney,
  consultTypes,
  agreementParagraphs,
  prefill,
  initialSlots,
  resume,
  acceptsPayments,
  children,
}: {
  firm: PublicFirm;
  attorney: PublicAttorney;
  consultTypes: ConsultTypeOption[];
  agreementParagraphs: string[];
  prefill: { firstName?: string; lastName?: string; email?: string; phone?: string };
  /** The first week of open times, when the firm has a single consultation type. */
  initialSlots: SlotPageData | null;
  resume: ResumedBooking | null;
  acceptsPayments: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => {
    const initial = createInitialWizardState(prefill);
    if (consultTypes.length === 1) initial.booking.consultTypeId = consultTypes[0].id;
    if (!resume) return initial;
    return {
      ...initial,
      booking: { consultTypeId: resume.consultTypeId, date: resume.date, startsAt: resume.startsAt, timeLabel: resume.timeLabel },
      held: true,
      intakeSaved: Boolean(resume.intake),
      intake: { ...initial.intake, ...resume.intake },
      documents: resume.documents,
      agreementSigned: resume.agreementSigned,
      agreement: { agreed: resume.agreementSigned, signature: resume.signature },
    };
  });
  const [slots, setSlots] = useState<SlotPage>(() => (initialSlots ? { ...initialSlots, loading: false } : EMPTY_SLOTS));
  const basePath = `/f/${firm.slug}`;
  const bookPath = `${basePath}/book/${attorney.slug}`;
  const caseTypes = [...attorney.practiceAreas, "Other"];
  const selectedConsultType = consultTypes.find((c) => c.id === state.booking.consultTypeId);

  const goToStep = (step: string) => router.push(`${bookPath}/${step}`);
  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  /** The hold has lapsed on the server, so start again from the time step. */
  const restartFromTime = (message: string) => {
    setState((s) => ({ ...s, held: false, notice: message, pending: false, booking: { ...s.booking, startsAt: null, timeLabel: null } }));
    goToStep("time");
  };

  const fetchSlots = useCallback(
    async (consultTypeId: string, fromDate?: string) => {
      setSlots((s) => ({ ...s, loading: true }));
      const result = await loadSlots({ firmSlug: firm.slug, attorneySlug: attorney.slug, consultTypeId, fromDate });
      if (!result.ok) {
        setSlots(EMPTY_SLOTS);
        patch({ notice: result.error });
        return;
      }
      setSlots({ fromDate: result.fromDate, days: result.days, canGoBack: result.canGoBack, canGoForward: result.canGoForward, loading: false });
    },
    [firm.slug, attorney.slug],
  );


  const setConsultType = (id: string) => {
    setState((s) => ({ ...s, notice: null, held: false, booking: { consultTypeId: id, date: null, startsAt: null, timeLabel: null } }));
    void fetchSlots(id, slots.fromDate ?? undefined);
  };

  const showWeek = (direction: "back" | "forward") => {
    if (!state.booking.consultTypeId || !slots.fromDate) return;
    const [y, m, d] = slots.fromDate.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + (direction === "forward" ? 7 : -7))).toISOString().slice(0, 10);
    void fetchSlots(state.booking.consultTypeId, next);
  };

  const setDate = (date: string) =>
    setState((s) => ({ ...s, held: false, booking: { ...s.booking, date, startsAt: null, timeLabel: null } }));
  const setTime = (startsAt: string, timeLabel: string) =>
    setState((s) => ({ ...s, held: false, booking: { ...s.booking, startsAt, timeLabel } }));

  const goToIntake = async () => {
    const { consultTypeId, startsAt } = state.booking;
    if (!consultTypeId || !startsAt) return;
    if (state.held) return goToStep("intake");
    patch({ pending: true, notice: null });
    const result = await holdSlot({ firmSlug: firm.slug, attorneySlug: attorney.slug, consultTypeId, startsAt });
    if (!result.ok) {
      setState((s) => ({ ...s, pending: false, notice: result.error, booking: { ...s.booking, startsAt: null, timeLabel: null } }));
      if (result.code === "taken") void fetchSlots(consultTypeId, slots.fromDate ?? undefined);
      return;
    }
    patch({ pending: false, held: true });
    goToStep("intake");
  };

  const onIntakeChange = (p: Partial<IntakeState>) => setState((s) => ({ ...s, intake: { ...s.intake, ...p } }));

  const submitIntake = async () => {
    const i = state.intake;
    const errors: WizardState["errors"] = {};
    if (!i.firstName.trim()) errors.firstName = true;
    if (!i.lastName.trim()) errors.lastName = true;
    if (!i.email.trim()) errors.email = true;
    if (!i.phone.trim()) errors.phone = true;
    if (!i.caseType) errors.caseType = true;
    if (!i.details.trim()) errors.details = true;
    if (!i.ack) errors.ack = true;
    if (!i.privacyConsent) errors.privacyConsent = true;
    if (Object.keys(errors).length) return patch({ errors, notice: null });

    patch({ pending: true, errors: {}, notice: null });
    const result = await submitIntakeAction({ firmSlug: firm.slug, intake: i });
    if (!result.ok) {
      if (result.code === "expired") return restartFromTime(result.error);
      const fieldErrors = Object.fromEntries((("fields" in result && result.fields) || []).map((f) => [f as ErrorKey, true]));
      return patch({ pending: false, errors: fieldErrors, notice: result.error });
    }
    patch({ pending: false, intakeSaved: true });
    goToStep("documents");
  };

  const uploadFiles = async (files: FileList) => {
    patch({ pending: true, notice: null });
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const url = await createUploadUrl({ firmSlug: firm.slug, fileName: file.name, size: file.size, mimeType: file.type });
      if (!url.ok) {
        if (url.code === "expired") return restartFromTime(url.error);
        patch({ notice: `${file.name}: ${url.error}` });
        continue;
      }
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(url.path, url.token, file, { contentType: file.type });
      if (error) {
        patch({ notice: `${file.name} couldn't be uploaded. Please try again.` });
        continue;
      }
      const saved = await confirmUpload({ firmSlug: firm.slug, path: url.path, fileName: file.name });
      if (!saved.ok) {
        patch({ notice: `${file.name}: ${saved.error}` });
        continue;
      }
      setState((s) => ({ ...s, documents: [...s.documents, saved.document] }));
    }
    patch({ pending: false });
  };

  const removeDocument = async (id: string) => {
    const result = await removeUpload({ firmSlug: firm.slug, documentId: id });
    if (!result.ok) return patch({ notice: result.error });
    setState((s) => ({ ...s, documents: s.documents.filter((d) => d.id !== id) }));
  };

  const goToAgreement = () => goToStep("agreement");

  const onAgreementToggle = (agreed: boolean) => setState((s) => ({ ...s, agreement: { ...s.agreement, agreed } }));
  const onAgreementSignature = (signature: string) => setState((s) => ({ ...s, agreement: { ...s.agreement, signature } }));

  const submitAgreement = async () => {
    const a = state.agreement;
    if (!a.agreed || !a.signature.trim()) return patch({ errors: { agreement: true } });
    patch({ pending: true, errors: {}, notice: null });
    const result = await signAgreement({ firmSlug: firm.slug, signatureName: a.signature });
    if (!result.ok) {
      if (result.code === "expired") return restartFromTime(result.error);
      return patch({ pending: false, notice: result.error });
    }
    patch({ pending: false, agreementSigned: true });
    goToStep("payment");
  };

  const confirmBooking = async () => {
    patch({ pending: true, notice: null });
    const result = await confirmFreeBooking({ firmSlug: firm.slug });
    if (!result.ok) {
      if (result.code === "expired") return restartFromTime(result.error);
      return patch({ pending: false, notice: result.error });
    }
    patch({ pending: false });
    goToStep(selectedConsultType?.mode === "video" ? "video" : "confirmation");
  };

  const payNow = async () => {
    patch({ pending: true, notice: null });
    const result = await startCheckout({ firmSlug: firm.slug });
    if (!result.ok) {
      if (result.code === "expired") return restartFromTime(result.error);
      return patch({ pending: false, notice: result.error });
    }
    // PayMongo's hosted checkout is a separate site, so this is a full navigation.
    window.location.assign(result.checkoutUrl);
  };

  const toggleCameraCheck = () => setState((s) => ({ ...s, cameraOk: !s.cameraOk }));
  const toggleMicCheck = () => setState((s) => ({ ...s, micOk: !s.micOk }));
  const finishVideoCheck = () => goToStep("confirmation");

  const restart = () => router.push(basePath);

  const value: WizardContextValue = {
    firm,
    attorney,
    consultTypes,
    agreementParagraphs,
    caseTypes,
    state,
    slots,
    selectedConsultType,
    basePath,
    acceptsPayments,
    setConsultType,
    showWeek,
    setDate,
    setTime,
    goToIntake: () => void goToIntake(),
    onIntakeChange,
    submitIntake: () => void submitIntake(),
    uploadFiles: (files) => void uploadFiles(files),
    removeDocument: (id) => void removeDocument(id),
    goToAgreement,
    onAgreementToggle,
    onAgreementSignature,
    submitAgreement: () => void submitAgreement(),
    confirmBooking: () => void confirmBooking(),
    payNow: () => void payNow(),
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
