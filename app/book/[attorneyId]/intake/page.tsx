"use client";

import { BookIntakeScreen } from "@/components/booking/screens/book-intake-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function IntakeStepPage() {
  const { attorney, state, onIntakeChange, backToDirectoryFromConflict, submitIntake } = useWizard();

  return (
    <BookIntakeScreen
      attorneyName={attorney.name}
      intake={state.intake}
      errors={state.errors}
      conflictFlagged={state.conflictFlagged}
      onIntakeChange={onIntakeChange}
      onBackToDirectoryFromConflict={backToDirectoryFromConflict}
      onSubmit={submitIntake}
    />
  );
}
