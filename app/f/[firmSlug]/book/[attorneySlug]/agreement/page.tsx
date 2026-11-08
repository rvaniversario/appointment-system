"use client";

import { BookAgreementScreen } from "@/components/booking/screens/book-agreement-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function AgreementStepPage() {
  const { attorney, agreementParagraphs, state, onAgreementToggle, onAgreementSignature, submitAgreement } = useWizard();

  return (
    <BookAgreementScreen
      attorneyName={attorney.name}
      paragraphs={agreementParagraphs}
      notice={state.notice}
      pending={state.pending}
      agreement={state.agreement}
      errors={state.errors}
      onToggle={onAgreementToggle}
      onSignatureChange={onAgreementSignature}
      onSubmit={submitAgreement}
    />
  );
}
