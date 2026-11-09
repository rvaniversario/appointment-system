"use client";

import { BookIntakeScreen } from "@/components/booking/screens/book-intake-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function IntakeStepPage() {
  const { firm, caseTypes, state, onIntakeChange, submitIntake, onEmailCode, submitEmailCode, resendCode, cancelEmailCode } = useWizard();

  return (
    <BookIntakeScreen
      firmName={firm.name}
      caseTypes={caseTypes}
      intake={state.intake}
      errors={state.errors}
      notice={state.notice}
      pending={state.pending}
      emailCode={state.emailCode}
      onIntakeChange={onIntakeChange}
      onSubmit={submitIntake}
      onEmailCode={onEmailCode}
      onSubmitEmailCode={submitEmailCode}
      onResendCode={resendCode}
      onCancelEmailCode={cancelEmailCode}
    />
  );
}
