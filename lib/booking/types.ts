/** Steps of the booking wizard at app/f/[firmSlug]/book/[attorneySlug]/<step>. */
export type WizardStepId =
  | "time"
  | "intake"
  | "documents"
  | "agreement"
  | "payment"
  | "video"
  | "confirmation";

export type Urgency = "standard" | "urgent";

export interface IntakeState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  caseType: string;
  urgency: Urgency;
  details: string;
  opposingParty: string;
  ack: boolean;
  /** Data Privacy Act (RA 10173) consent. */
  privacyConsent: boolean;
  smsOptIn: boolean;
}

export interface BookingSelection {
  consultTypeId: string;
  /** Manila date, "YYYY-MM-DD". */
  date: string | null;
  /** ISO instant of the chosen start time. */
  startsAt: string | null;
  /** "9:00 AM" */
  timeLabel: string | null;
}

export interface UploadedFile {
  id: string;
  name: string;
}

export interface AgreementState {
  agreed: boolean;
  signature: string;
}

export interface EmailCodeState {
  /** The address the code went to. */
  email: string;
  code: string;
  /** What happened last, e.g. "We emailed a code to …". */
  info: string;
  error: string | null;
}

export type SettingsTab = "profile" | "billing";

export interface SettingsState {
  photo: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  email: string;
  mobile: string;
  smsOptIn: boolean;
  password: string;
  confirmPassword: string;
}

export type ErrorKey =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "details"
  | "ack"
  | "privacyConsent"
  | "caseType"
  | "agreement";

export type ErrorState = Partial<Record<ErrorKey, boolean>>;

/** Browser-side state of the booking wizard. The server holds the real booking. */
export interface WizardState {
  booking: BookingSelection;
  /** True once the server holds the selected time for this visitor. */
  held: boolean;
  intakeSaved: boolean;
  intake: IntakeState;
  documents: UploadedFile[];
  agreement: AgreementState;
  agreementSigned: boolean;
  errors: ErrorState;
  /** Set while a guest is asked for the code emailed to them. */
  emailCode: EmailCodeState | null;
  /** A message from the server to show on the current step. */
  notice: string | null;
  pending: boolean;
  cameraOk: boolean;
  micOk: boolean;
}
