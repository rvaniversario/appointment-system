import { PRACTICE_AREAS } from "./data";
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

export function createInitialWizardState(): WizardState {
  return {
    booking: { consultType: "", dateIndex: null, time: null },
    intake: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      caseType: PRACTICE_AREAS[0],
      urgency: "standard",
      details: "",
      opposingParty: "",
      ack: false,
    },
    conflictFlagged: false,
    documents: [],
    agreement: { agreed: false, signature: "" },
    payment: { cardName: "", cardNumber: "", cardExpiry: "", cardCvc: "" },
    errors: {},
    cameraOk: false,
    micOk: false,
  };
}
