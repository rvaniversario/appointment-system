export type ScreenId =
  | "home"
  | "directory"
  | "profile"
  | "time"
  | "intake"
  | "documents"
  | "agreement"
  | "payment"
  | "video"
  | "confirmation"
  | "portal-login"
  | "portal-2fa"
  | "portal"
  | "admin-login"
  | "admin-2fa"
  | "admin"
  | "settings";

export interface Attorney {
  id: string;
  name: string;
  practiceAreas: string[];
  languages: string[];
  location: string;
  barAdmission: string;
  bio: string;
  /** avail[dayIndex] = list of TIME_SLOTS indexes open that day */
  avail: number[][];
}

export interface ConsultType {
  id: string;
  label: string;
  sub: string;
  price: string;
  priceLabel: string;
}

export interface ConflictEntry {
  name: string;
  matter: string;
  attorneyId: string;
}

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
}

export interface BookingSelection {
  consultType: string;
  dateIndex: number | null;
  time: string | null;
}

export interface AgreementState {
  agreed: boolean;
  signature: string;
}

export interface PaymentState {
  cardName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
}

export interface PortalAppointment {
  id: number;
  attorneyId: string;
  dateLabel: string;
  dateIndex: number | null;
  time: string;
  type: string;
  status: "upcoming" | "canceled";
}

export interface PortalMessage {
  from: "attorney" | "client";
  text: string;
}

export interface PortalDocument {
  name: string;
}

export interface PortalInvoice {
  id: number;
  desc: string;
  amount: string;
  date: string;
  status: "due" | "paid";
}

export type PortalTab = "appointments" | "messages" | "documents" | "billing";

export interface PortalState {
  loginEmail: string;
  loginPassword: string;
  code: string;
  loggedIn: boolean;
  tab: PortalTab;
  appointments: PortalAppointment[];
  rescheduleId: number | null;
  rescheduleDateIndex: number | null;
  rescheduleTime: string | null;
  messages: PortalMessage[];
  messageDraft: string;
  documents: PortalDocument[];
  invoices: PortalInvoice[];
}

export type AdminRole = "attorney" | "partner";
export type AdminTab = "calendar" | "queue" | "conflicts" | "analytics" | "billing";

export interface QueueLead {
  id: number;
  name: string;
  caseType: string;
  urgency: Urgency;
  attorneyId: string;
  conflict: boolean;
  status: "pending" | "approved";
  reassignTo: string;
}

export interface AdminState {
  loginEmail: string;
  loginPassword: string;
  code: string;
  role: AdminRole;
  tab: AdminTab;
  conflictSearch: string;
  queue: QueueLead[];
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
  | "agreement"
  | "payment"
  | "portalLogin"
  | "portal2fa"
  | "adminLogin"
  | "admin2fa"
  | "settingsPassword";

export type ErrorState = Partial<Record<ErrorKey, boolean>>;

export interface BookingState {
  screen: ScreenId;
  filters: { practiceArea: string; language: string; location: string };
  selectedAttorneyId: string | null;
  booking: BookingSelection;
  intake: IntakeState;
  conflictFlagged: boolean;
  documents: string[];
  agreement: AgreementState;
  payment: PaymentState;
  errors: ErrorState;
  cameraOk: boolean;
  micOk: boolean;
  userMenuOpen: boolean;
  settingsPrevScreen: ScreenId | null;
  settingsSaved: boolean;
  settingsTab: SettingsTab;
  settings: SettingsState;
  portal: PortalState;
  admin: AdminState;
}

export interface DayInfo {
  dow: string;
  day: number;
  label: string;
}
