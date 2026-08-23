import { CONSULT_TYPES } from "./data";
import type { DayInfo, WizardState, WizardStepId } from "./types";

export const BOOKING_STEP_ORDER: WizardStepId[] = [
  "time",
  "intake",
  "documents",
  "agreement",
  "payment",
];

export const BOOKING_STEP_LABELS = ["Time", "Intake", "Documents", "Agreement", "Payment"];

export interface BookingSummary {
  consultTypeLabel: string;
  priceLabel: string;
  dateLabel: string;
  time: string;
}

export function getBookingSummary(state: WizardState, days: DayInfo[]): BookingSummary {
  const ctMeta = CONSULT_TYPES.find((c) => c.id === state.booking.consultType);
  return {
    consultTypeLabel: ctMeta?.label || "",
    priceLabel: ctMeta?.priceLabel || "",
    dateLabel: state.booking.dateIndex != null ? days[state.booking.dateIndex].label : "",
    time: state.booking.time || "",
  };
}

export function isTimeStepComplete(state: WizardState): boolean {
  return Boolean(state.booking.consultType) && state.booking.dateIndex != null && Boolean(state.booking.time);
}

export function isAgreementStepComplete(state: WizardState): boolean {
  return state.agreement.agreed && state.agreement.signature.trim().length > 0;
}
