"use client";

import { BookDocumentsScreen } from "@/components/booking/screens/book-documents-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function DocumentsStepPage() {
  const { state, addDemoDocument, removeDocument, goToAgreement } = useWizard();

  return (
    <BookDocumentsScreen
      documents={state.documents}
      onAdd={addDemoDocument}
      onRemove={removeDocument}
      onContinue={goToAgreement}
    />
  );
}
