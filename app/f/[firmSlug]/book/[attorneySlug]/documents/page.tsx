"use client";

import { BookDocumentsScreen } from "@/components/booking/screens/book-documents-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function DocumentsStepPage() {
  const { state, uploadFiles, removeDocument, goToAgreement } = useWizard();

  return (
    <BookDocumentsScreen
      documents={state.documents}
      notice={state.notice}
      pending={state.pending}
      onUpload={uploadFiles}
      onRemove={removeDocument}
      onContinue={goToAgreement}
    />
  );
}
