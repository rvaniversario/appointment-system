import type { WizardState } from "./types";

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
    emailCode: null,
    notice: null,
    pending: false,
    cameraOk: false,
    micOk: false,
  };
}
