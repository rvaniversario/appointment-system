"use client";

import { BookAgreementScreen } from "@/components/booking/screens/book-agreement-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function AgreementStepPage() {
  const { attorney, state, onAgreementToggle, onAgreementSignature, submitAgreement } = useWizard();

  return (
    <BookAgreementScreen
      attorneyName={attorney.name}
      agreement={state.agreement}
      errors={state.errors}
      onToggle={onAgreementToggle}
      onSignatureChange={onAgreementSignature}
      onSubmit={submitAgreement}
    />
  );
}
