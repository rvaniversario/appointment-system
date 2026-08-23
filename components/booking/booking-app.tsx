"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONSULT_TYPES,
  getAttorney,
  getNext7Days,
  initialsOf,
} from "@/lib/booking/data";
import { createInitialState } from "@/lib/booking/initial-state";
import type {
  AdminRole,
  AdminTab,
  AgreementState,
  Attorney,
  BookEntryScreen,
  BookingState,
  IntakeState,
  PaymentState,
  PortalTab,
  ScreenId,
  SettingsState,
  SettingsTab,
} from "@/lib/booking/types";
import { Header, type StepperItem, type UserMenuData } from "./header";
import { Footer } from "./footer";
import { BookTimeScreen } from "./screens/book-time-screen";
import { BookIntakeScreen } from "./screens/book-intake-screen";
import { BookDocumentsScreen } from "./screens/book-documents-screen";
import { BookAgreementScreen } from "./screens/book-agreement-screen";
import { BookPaymentScreen } from "./screens/book-payment-screen";
import { BookVideoScreen } from "./screens/book-video-screen";
import { ConfirmationScreen } from "./screens/confirmation-screen";
import { PortalLoginScreen } from "./screens/portal-login-screen";
import { AdminLoginScreen } from "./screens/admin-login-screen";
import { TwoFactorScreen } from "./screens/two-factor-screen";
import { PortalScreen } from "./screens/portal-screen";
import { AdminScreen } from "./screens/admin-screen";
import { SettingsScreen } from "./screens/settings-screen";

const BOOKING_ORDER: ScreenId[] = ["time", "intake", "documents", "agreement", "payment"];
const STEP_LABELS = ["Time", "Intake", "Documents", "Agreement", "Payment"];

const PLACEHOLDER_ATTORNEY: Attorney = {
  id: "",
  name: "",
  practiceAreas: [],
  languages: [],
  location: "",
  barAdmission: "",
  bio: "",
  avail: [],
};

interface BookingAppProps {
  initialScreen: BookEntryScreen;
  initialAttorneyId?: string | null;
}

export function BookingApp({ initialScreen, initialAttorneyId = null }: BookingAppProps) {
  const router = useRouter();
  const [state, setState] = useState<BookingState>(() =>
    createInitialState({ screen: initialScreen, selectedAttorneyId: initialAttorneyId })
  );

  const days = getNext7Days();
  const screen = state.screen;
  const attorney = getAttorney(state.selectedAttorneyId) ?? PLACEHOLDER_ATTORNEY;

  // ---- navigation & simple setters ----
  const goHome = () => router.push("/");

  const setConsultType = (id: string) =>
    setState((s) => ({ ...s, booking: { ...s.booking, consultType: id } }));
  const setDate = (i: number) =>
    setState((s) => ({ ...s, booking: { ...s.booking, dateIndex: i, time: null } }));
  const setTime = (t: string) => setState((s) => ({ ...s, booking: { ...s.booking, time: t } }));
  const goToIntake = () => setState((s) => ({ ...s, screen: "intake" }));

  const onIntakeChange = (patch: Partial<IntakeState>) =>
    setState((s) => ({ ...s, intake: { ...s.intake, ...patch } }));

  const submitIntake = () =>
    setState((s) => {
      const i = s.intake;
      const errors: BookingState["errors"] = {};
      if (!i.firstName.trim()) errors.firstName = true;
      if (!i.lastName.trim()) errors.lastName = true;
      if (!i.email.trim()) errors.email = true;
      if (!i.phone.trim()) errors.phone = true;
      if (!i.details.trim()) errors.details = true;
      if (!i.ack) errors.ack = true;
      if (Object.keys(errors).length) return { ...s, errors };
      const flagged = i.opposingParty.trim().toLowerCase().includes("smith");
      return { ...s, errors: {}, conflictFlagged: flagged, screen: flagged ? "intake" : "documents" };
    });

  const backToDirectoryFromConflict = () => router.push("/attorneys");

  const addDemoDocument = () =>
    setState((s) => ({ ...s, documents: [...s.documents, `Document ${s.documents.length + 1}.pdf`] }));
  const removeDocument = (idx: number) =>
    setState((s) => ({ ...s, documents: s.documents.filter((_, i) => i !== idx) }));
  const goToAgreement = () => setState((s) => ({ ...s, screen: "agreement" }));

  const onAgreementToggle = (agreed: boolean) =>
    setState((s) => ({ ...s, agreement: { ...s.agreement, agreed } }));
  const onAgreementSignature = (signature: string) =>
    setState((s) => ({ ...s, agreement: { ...s.agreement, signature } }));
  const submitAgreement = () =>
    setState((s) => {
      const a: AgreementState = s.agreement;
      if (!a.agreed || !a.signature.trim()) return { ...s, errors: { agreement: true } };
      return { ...s, errors: {}, screen: "payment" };
    });

  const onPaymentChange = (patch: Partial<PaymentState>) =>
    setState((s) => ({ ...s, payment: { ...s.payment, ...patch } }));
  const submitPayment = () =>
    setState((s) => {
      const isFree = s.booking.consultType === "free-phone";
      if (!isFree) {
        const p = s.payment;
        if (!p.cardName.trim() || !p.cardNumber.trim() || !p.cardExpiry.trim() || !p.cardCvc.trim()) {
          return { ...s, errors: { payment: true } };
        }
      }
      return { ...s, errors: {}, screen: s.booking.consultType === "video-30" ? "video" : "confirmation" };
    });

  const toggleCameraCheck = () => setState((s) => ({ ...s, cameraOk: !s.cameraOk }));
  const toggleMicCheck = () => setState((s) => ({ ...s, micOk: !s.micOk }));
  const finishVideoCheck = () => setState((s) => ({ ...s, screen: "confirmation" }));

  const goToStep = (target: ScreenId) =>
    setState((s) => {
      const current = BOOKING_ORDER.indexOf(s.screen);
      const idx = BOOKING_ORDER.indexOf(target);
      if (idx >= 0 && idx <= current) return { ...s, screen: target };
      return s;
    });

  const restart = () => router.push("/attorneys");

  // ---- portal / user menu / settings ----
  const openPortal = () => setState((s) => ({ ...s, screen: "portal-login" }));
  const toggleUserMenu = () => setState((s) => ({ ...s, userMenuOpen: !s.userMenuOpen }));
  const openSettings = (firstName: string, lastName: string, email: string) =>
    setState((s) => ({
      ...s,
      screen: "settings",
      userMenuOpen: false,
      settingsPrevScreen: s.screen,
      settingsSaved: false,
      settingsTab: "profile",
      settings: {
        ...s.settings,
        firstName: s.settings.firstName || firstName,
        lastName: s.settings.lastName || lastName,
        email: s.settings.email || email,
        mobile: s.settings.mobile || "",
      },
    }));
  const goBackFromSettings = () => {
    if (state.settingsPrevScreen) {
      setState((s) => ({ ...s, screen: s.settingsPrevScreen! }));
    } else {
      router.push("/");
    }
  };
  const setSettingsTab = (tab: SettingsTab) => setState((s) => ({ ...s, settingsTab: tab }));
  const onSettingsFieldChange = (patch: Partial<SettingsState>) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const onSettingsPhotoChange = (dataUrl: string) =>
    setState((s) => ({ ...s, settings: { ...s.settings, photo: dataUrl } }));
  const saveSettings = () =>
    setState((s) => {
      if (s.settings.password && s.settings.password !== s.settings.confirmPassword) {
        return { ...s, errors: { settingsPassword: true } };
      }
      return {
        ...s,
        errors: {},
        settingsSaved: true,
        settings: { ...s.settings, password: "", confirmPassword: "" },
      };
    });

  const portalLogout = () => router.push("/");
  const onPortalLoginEmail = (v: string) =>
    setState((s) => ({ ...s, portal: { ...s.portal, loginEmail: v } }));
  const onPortalLoginPassword = (v: string) =>
    setState((s) => ({ ...s, portal: { ...s.portal, loginPassword: v } }));
  const submitPortalLogin = () =>
    setState((s) => {
      const p = s.portal;
      if (!p.loginEmail.trim() || !p.loginPassword.trim()) return { ...s, errors: { portalLogin: true } };
      return { ...s, errors: {}, screen: "portal-2fa" };
    });
  const onPortalCode = (v: string) => setState((s) => ({ ...s, portal: { ...s.portal, code: v } }));
  const submitPortal2fa = () =>
    setState((s) => {
      if (!s.portal.code.trim()) return { ...s, errors: { portal2fa: true } };
      return { ...s, errors: {}, screen: "portal", portal: { ...s.portal, loggedIn: true } };
    });
  const goToPortalTab = (tab: PortalTab) =>
    setState((s) => ({ ...s, screen: "portal", userMenuOpen: false, portal: { ...s.portal, tab } }));

  const startReschedule = (id: number) =>
    setState((s) => ({
      ...s,
      portal: { ...s.portal, rescheduleId: id, rescheduleDateIndex: null, rescheduleTime: null },
    }));
  const cancelRescheduleUI = () =>
    setState((s) => ({
      ...s,
      portal: { ...s.portal, rescheduleId: null, rescheduleDateIndex: null, rescheduleTime: null },
    }));
  const setRescheduleDate = (i: number) =>
    setState((s) => ({ ...s, portal: { ...s.portal, rescheduleDateIndex: i, rescheduleTime: null } }));
  const setRescheduleTime = (t: string) =>
    setState((s) => ({ ...s, portal: { ...s.portal, rescheduleTime: t } }));
  const confirmReschedule = (id: number) =>
    setState((s) => {
      const dateLabel =
        s.portal.rescheduleDateIndex != null ? days[s.portal.rescheduleDateIndex].label : "";
      return {
        ...s,
        portal: {
          ...s.portal,
          rescheduleId: null,
          rescheduleDateIndex: null,
          rescheduleTime: null,
          appointments: s.portal.appointments.map((a) =>
            a.id === id
              ? { ...a, dateLabel: dateLabel || a.dateLabel, time: s.portal.rescheduleTime || a.time }
              : a
          ),
        },
      };
    });
  const cancelAppointment = (id: number) =>
    setState((s) => ({
      ...s,
      portal: {
        ...s.portal,
        appointments: s.portal.appointments.map((a) =>
          a.id === id ? { ...a, status: "canceled" as const } : a
        ),
      },
    }));

  const onPortalMessageDraft = (v: string) =>
    setState((s) => ({ ...s, portal: { ...s.portal, messageDraft: v } }));
  const sendPortalMessage = () =>
    setState((s) => {
      const draft = s.portal.messageDraft.trim();
      if (!draft) return s;
      return {
        ...s,
        portal: {
          ...s.portal,
          messageDraft: "",
          messages: [...s.portal.messages, { from: "client" as const, text: draft }],
        },
      };
    });

  const addPortalDocument = () =>
    setState((s) => ({
      ...s,
      portal: {
        ...s.portal,
        documents: [...s.portal.documents, { name: `Document ${s.portal.documents.length + 1}.pdf` }],
      },
    }));
  const payInvoice = (id: number) =>
    setState((s) => ({
      ...s,
      portal: {
        ...s.portal,
        invoices: s.portal.invoices.map((inv) => (inv.id === id ? { ...inv, status: "paid" as const } : inv)),
      },
    }));

  // ---- admin / staff ----
  const openAdmin = () => setState((s) => ({ ...s, screen: "admin-login" }));
  const onAdminLoginEmail = (v: string) =>
    setState((s) => ({ ...s, admin: { ...s.admin, loginEmail: v } }));
  const onAdminLoginPassword = (v: string) =>
    setState((s) => ({ ...s, admin: { ...s.admin, loginPassword: v } }));
  const submitAdminLogin = () =>
    setState((s) => {
      const a = s.admin;
      if (!a.loginEmail.trim() || !a.loginPassword.trim()) return { ...s, errors: { adminLogin: true } };
      return { ...s, errors: {}, screen: "admin-2fa" };
    });
  const onAdminCode = (v: string) => setState((s) => ({ ...s, admin: { ...s.admin, code: v } }));
  const submitAdmin2fa = () =>
    setState((s) => {
      if (!s.admin.code.trim()) return { ...s, errors: { admin2fa: true } };
      return { ...s, errors: {}, screen: "admin", admin: { ...s.admin, tab: "calendar" } };
    });
  const adminLogout = () => router.push("/");
  const onAdminRoleChange = (role: AdminRole) =>
    setState((s) => {
      const allowed: AdminTab[] =
        role === "attorney"
          ? ["calendar", "queue", "conflicts", "analytics"]
          : ["calendar", "queue", "conflicts", "analytics", "billing"];
      return {
        ...s,
        admin: { ...s.admin, role, tab: allowed.includes(s.admin.tab) ? s.admin.tab : allowed[0] },
      };
    });
  const setAdminTab = (tab: AdminTab) => setState((s) => ({ ...s, admin: { ...s.admin, tab } }));
  const onAdminConflictSearch = (v: string) =>
    setState((s) => ({ ...s, admin: { ...s.admin, conflictSearch: v } }));
  const setLeadReassign = (id: number, val: string) =>
    setState((s) => ({
      ...s,
      admin: {
        ...s.admin,
        queue: s.admin.queue.map((l) => (l.id === id ? { ...l, reassignTo: val } : l)),
      },
    }));
  const reassignLead = (id: number) =>
    setState((s) => ({
      ...s,
      admin: {
        ...s.admin,
        queue: s.admin.queue.map((l) =>
          l.id === id && l.reassignTo
            ? { ...l, attorneyId: l.reassignTo, conflict: false, status: "approved" as const, reassignTo: "" }
            : l
        ),
      },
    }));
  const approveLead = (id: number) =>
    setState((s) => ({
      ...s,
      admin: {
        ...s.admin,
        queue: s.admin.queue.map((l) => (l.id === id ? { ...l, status: "approved" as const } : l)),
      },
    }));

  // ---- derived / header state ----
  const bookingOrderIdx = BOOKING_ORDER.indexOf(screen);
  const showStepper = bookingOrderIdx >= 0;
  const stepper: StepperItem[] | null = showStepper
    ? STEP_LABELS.map((stepLabel, idx) => ({
        label: stepLabel,
        state: idx < bookingOrderIdx ? "done" : idx === bookingOrderIdx ? "current" : "todo",
        onClick: idx < bookingOrderIdx ? () => goToStep(BOOKING_ORDER[idx]) : undefined,
      }))
    : null;

  const isPortalArea = screen === "portal-login" || screen === "portal-2fa" || screen === "portal";
  const isStaffContext = screen === "admin" || (screen === "settings" && state.settingsPrevScreen === "admin");
  const clientBlockedScreens: ScreenId[] = ["admin-login", "admin-2fa", "admin", "portal-login", "portal-2fa"];
  const isClientContext = state.portal.loggedIn && !isStaffContext && !clientBlockedScreens.includes(screen);
  const showBackLink =
    !showStepper &&
    screen !== "confirmation" &&
    !isPortalArea &&
    screen !== "admin-login" &&
    screen !== "admin-2fa" &&
    screen !== "admin" &&
    screen !== "settings" &&
    !isClientContext;

  const settingsFullName = [state.settings.firstName, state.settings.lastName].filter(Boolean).join(" ");
  let userMenu: UserMenuData | null = null;
  if (isClientContext) {
    const defaultFirst = state.intake.firstName || "Client";
    const defaultLast = state.intake.lastName || "Account";
    const name = settingsFullName || `${defaultFirst} ${defaultLast}`.trim();
    const email = state.settings.email || state.portal.loginEmail || state.intake.email || "client@example.com";
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: true,
      photo: state.settings.photo,
      onLogout: portalLogout,
      onSettings: () => openSettings(defaultFirst, defaultLast, email),
      onAppointments: () => goToPortalTab("appointments"),
      onMessages: () => goToPortalTab("messages"),
      onDocuments: () => goToPortalTab("documents"),
    };
  } else if (isStaffContext) {
    const roleLabelMap: Record<AdminRole, string> = { attorney: "Attorney", partner: "Super admin" };
    const roleName = roleLabelMap[state.admin.role];
    const name = settingsFullName || roleName;
    const email = state.settings.email || state.admin.loginEmail || "staff@harlowreyes.com";
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: false,
      photo: state.settings.photo,
      onLogout: adminLogout,
      onSettings: () => openSettings(roleName, "", email),
    };
  }

  const ctMeta = CONSULT_TYPES.find((c) => c.id === state.booking.consultType);
  const isFreeConsult = state.booking.consultType === "free-phone";
  const bookingSummary = {
    consultTypeLabel: ctMeta?.label || "",
    priceLabel: ctMeta?.priceLabel || "",
    dateLabel: state.booking.dateIndex != null ? days[state.booking.dateIndex].label : "",
    time: state.booking.time || "",
  };

  const settingsAvailableTabs: { key: SettingsTab; label: string }[] =
    state.settingsPrevScreen === "admin"
      ? [{ key: "profile", label: "Update profile" }]
      : [
          { key: "profile", label: "Update profile" },
          { key: "billing", label: "Billing & invoices" },
        ];

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "var(--font-public-sans), sans-serif",
        color: "oklch(0.32 0.01 258)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        onGoHome={goHome}
        stepper={stepper}
        userMenu={userMenu}
        userMenuOpen={state.userMenuOpen}
        onToggleUserMenu={toggleUserMenu}
        showBackLink={showBackLink}
        onOpenPortal={openPortal}
      />

      <main style={{ flex: 1, width: "100%" }}>
        {screen === "time" && (
          <BookTimeScreen
            attorney={attorney}
            booking={state.booking}
            days={days}
            onSetConsultType={setConsultType}
            onSetDate={setDate}
            onSetTime={setTime}
            onContinue={goToIntake}
          />
        )}

        {screen === "intake" && (
          <BookIntakeScreen
            attorneyName={attorney.name}
            intake={state.intake}
            errors={state.errors}
            conflictFlagged={state.conflictFlagged}
            onIntakeChange={onIntakeChange}
            onBackToDirectoryFromConflict={backToDirectoryFromConflict}
            onSubmit={submitIntake}
          />
        )}

        {screen === "documents" && (
          <BookDocumentsScreen
            documents={state.documents}
            onAdd={addDemoDocument}
            onRemove={removeDocument}
            onContinue={goToAgreement}
          />
        )}

        {screen === "agreement" && (
          <BookAgreementScreen
            attorneyName={attorney.name}
            agreement={state.agreement}
            errors={state.errors}
            onToggle={onAgreementToggle}
            onSignatureChange={onAgreementSignature}
            onSubmit={submitAgreement}
          />
        )}

        {screen === "payment" && (
          <BookPaymentScreen
            attorneyName={attorney.name}
            booking={bookingSummary}
            payment={state.payment}
            errors={state.errors}
            isFreeConsult={isFreeConsult}
            onPaymentChange={onPaymentChange}
            onSubmit={submitPayment}
          />
        )}

        {screen === "video" && (
          <BookVideoScreen
            dateLabel={bookingSummary.dateLabel}
            cameraOk={state.cameraOk}
            micOk={state.micOk}
            onToggleCamera={toggleCameraCheck}
            onToggleMic={toggleMicCheck}
            onFinish={finishVideoCheck}
          />
        )}

        {screen === "confirmation" && (
          <ConfirmationScreen
            firstName={state.intake.firstName}
            email={state.intake.email}
            attorneyName={attorney.name}
            booking={bookingSummary}
            onRestart={restart}
          />
        )}

        {screen === "portal-login" && (
          <PortalLoginScreen
            loginEmail={state.portal.loginEmail}
            loginPassword={state.portal.loginPassword}
            errors={state.errors}
            onEmailChange={onPortalLoginEmail}
            onPasswordChange={onPortalLoginPassword}
            onSubmit={submitPortalLogin}
          />
        )}

        {screen === "portal-2fa" && (
          <TwoFactorScreen
            title="Verify it's you"
            subtitle={`Enter the 6-digit code we sent to ${state.portal.loginEmail}.`}
            code={state.portal.code}
            hasError={!!state.errors.portal2fa}
            onCodeChange={onPortalCode}
            onSubmit={submitPortal2fa}
            showResend
          />
        )}

        {screen === "portal" && (
          <PortalScreen
            portal={state.portal}
            days={days}
            messagingAttorneyName={attorney.name}
            onGoHome={goHome}
            onReschedule={startReschedule}
            onCancel={cancelAppointment}
            onCancelRescheduleUI={cancelRescheduleUI}
            onSetRescheduleDate={setRescheduleDate}
            onSetRescheduleTime={setRescheduleTime}
            onConfirmReschedule={confirmReschedule}
            onMessageDraftChange={onPortalMessageDraft}
            onSendMessage={sendPortalMessage}
            onAddDocument={addPortalDocument}
          />
        )}

        {screen === "admin-login" && (
          <AdminLoginScreen
            loginEmail={state.admin.loginEmail}
            loginPassword={state.admin.loginPassword}
            errors={state.errors}
            onEmailChange={onAdminLoginEmail}
            onPasswordChange={onAdminLoginPassword}
            onSubmit={submitAdminLogin}
          />
        )}

        {screen === "admin-2fa" && (
          <TwoFactorScreen
            title="Verify it's you"
            subtitle="Enter the 6-digit code from your authenticator app. This step is required for all staff accounts."
            code={state.admin.code}
            hasError={!!state.errors.admin2fa}
            onCodeChange={onAdminCode}
            onSubmit={submitAdmin2fa}
            centered
          />
        )}

        {screen === "admin" && (
          <AdminScreen
            admin={state.admin}
            days={days}
            onRoleChange={onAdminRoleChange}
            onSetTab={setAdminTab}
            onConflictSearchChange={onAdminConflictSearch}
            onLeadReassignChange={setLeadReassign}
            onReassignLead={reassignLead}
            onApproveLead={approveLead}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen
            settings={state.settings}
            settingsTab={state.settingsTab}
            settingsSaved={state.settingsSaved}
            errors={state.errors}
            availableTabs={settingsAvailableTabs}
            portalInvoiceItems={state.portal.invoices}
            onBack={goBackFromSettings}
            onSetTab={setSettingsTab}
            onFieldChange={onSettingsFieldChange}
            onPhotoChange={onSettingsPhotoChange}
            onSave={saveSettings}
            onPayInvoice={payInvoice}
          />
        )}
      </main>

      <Footer onOpenAdmin={openAdmin} />
    </div>
  );
}
