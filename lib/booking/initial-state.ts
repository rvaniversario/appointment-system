import type { AdminState, WizardState } from "./types";

export function createInitialAdminState(): AdminState {
  return {
    loginEmail: "",
    loginPassword: "",
    code: "",
    role: "attorney",
    conflictSearch: "",
    queue: [
      { id: 1, name: "Jordan Blake", caseType: "Family Law", urgency: "urgent", attorneyId: "chen", conflict: false, status: "pending", reassignTo: "" },
      { id: 2, name: "Amara Smith", caseType: "Business Law", urgency: "standard", attorneyId: "whitfield", conflict: true, status: "pending", reassignTo: "" },
      { id: 3, name: "Luis Herrera", caseType: "Immigration", urgency: "standard", attorneyId: "ramirez", conflict: false, status: "approved", reassignTo: "" },
    ],
  };
}

export function createInitialWizardState(prefill: { firstName?: string; lastName?: string; email?: string; phone?: string } = {}): WizardState {
  return {
    booking: { consultTypeId: "", date: null, startsAt: null, timeLabel: null },
    held: false,
    intakeSaved: false,
    intake: {
      firstName: prefill.firstName ?? "",
      lastName: prefill.lastName ?? "",
      email: prefill.email ?? "",
      phone: prefill.phone ?? "",
      caseType: "",
      urgency: "standard",
      details: "",
      opposingParty: "",
      ack: false,
      privacyConsent: false,
      smsOptIn: false,
    },
    documents: [],
    agreement: { agreed: false, signature: "" },
    agreementSigned: false,
    errors: {},
    notice: null,
    pending: false,
    cameraOk: false,
    micOk: false,
  };
}
