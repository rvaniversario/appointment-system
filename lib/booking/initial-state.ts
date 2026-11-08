import type { AdminState, PortalState, WizardState } from "./types";

export function createInitialPortalState(): PortalState {
  return {
    loginEmail: "",
    code: "",
    appointments: [
      {
        id: 1,
        attorneyId: "ramirez",
        dateLabel: "Fri, Aug 14",
        dateIndex: null,
        time: "1:00 PM",
        type: "30-min Video Consultation",
        status: "upcoming",
      },
    ],
    rescheduleId: null,
    rescheduleDateIndex: null,
    rescheduleTime: null,
    messages: [
      {
        from: "attorney",
        text: "Thanks for your intake — looking forward to our consultation on Aug 14.",
      },
      { from: "client", text: "Thank you, see you then!" },
    ],
    messageDraft: "",
    documents: [{ name: "Passport copy.pdf" }, { name: "Lease agreement.pdf" }],
    invoices: [
      { id: 1, desc: "30-min Video Consultation", amount: "$150", date: "Aug 14, 2026", status: "due" },
      { id: 2, desc: "Retainer deposit", amount: "$1,000", date: "Jul 2, 2026", status: "paid" },
    ],
  };
}

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
