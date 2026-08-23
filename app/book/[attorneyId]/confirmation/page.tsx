"use client";

import { getNext7Days } from "@/lib/booking/data";
import { getBookingSummary } from "@/lib/booking/wizard";
import { ConfirmationScreen } from "@/components/booking/screens/confirmation-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function ConfirmationStepPage() {
  const { attorney, state, restart } = useWizard();

  return (
    <ConfirmationScreen
      firstName={state.intake.firstName}
      email={state.intake.email}
      attorneyName={attorney.name}
      booking={getBookingSummary(state, getNext7Days())}
      onRestart={restart}
    />
  );
}
