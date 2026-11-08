"use client";

import { getBookingSummary } from "@/lib/booking/wizard";
import { BookPaymentScreen } from "@/components/booking/screens/book-payment-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function PaymentStepPage() {
  const { firm, attorney, consultTypes, selectedConsultType, state, confirmBooking } = useWizard();

  return (
    <BookPaymentScreen
      attorneyName={attorney.name}
      firmName={firm.name}
      booking={getBookingSummary(state, consultTypes)}
      isFreeConsult={selectedConsultType?.priceCentavos === 0}
      notice={state.notice}
      pending={state.pending}
      onConfirm={confirmBooking}
    />
  );
}
