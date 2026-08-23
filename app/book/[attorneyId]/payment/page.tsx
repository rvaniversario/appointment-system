"use client";

import { getNext7Days } from "@/lib/booking/data";
import { getBookingSummary } from "@/lib/booking/wizard";
import { BookPaymentScreen } from "@/components/booking/screens/book-payment-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function PaymentStepPage() {
  const { attorney, state, onPaymentChange, submitPayment } = useWizard();
  const isFreeConsult = state.booking.consultType === "free-phone";

  return (
    <BookPaymentScreen
      attorneyName={attorney.name}
      booking={getBookingSummary(state, getNext7Days())}
      payment={state.payment}
      errors={state.errors}
      isFreeConsult={isFreeConsult}
      onPaymentChange={onPaymentChange}
      onSubmit={submitPayment}
    />
  );
}
