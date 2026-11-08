import type { ConsultTypeOption } from "./public-types";
import type { WizardState, WizardStepId } from "./types";
import { formatDateLabel } from "./time";

export const BOOKING_STEP_ORDER: WizardStepId[] = ["time", "intake", "documents", "agreement", "payment"];

export const BOOKING_STEP_LABELS = ["Time", "Intake", "Documents", "Agreement", "Payment"];

export interface BookingSummary {
  consultTypeLabel: string;
  priceLabel: string;
  dateLabel: string;
  time: string;
}

export function getBookingSummary(state: WizardState, consultTypes: ConsultTypeOption[]): BookingSummary {
  const consultType = consultTypes.find((c) => c.id === state.booking.consultTypeId);
  return {
    consultTypeLabel: consultType?.label ?? "",
    priceLabel: consultType ? (consultType.priceCentavos === 0 ? "Free" : consultType.priceLabel) : "",
    dateLabel: state.booking.date ? formatDateLabel(state.booking.date) : "",
    time: state.booking.timeLabel ?? "",
  };
}

export function isTimeStepComplete(state: WizardState): boolean {
  return Boolean(state.booking.consultTypeId && state.booking.startsAt);
}
