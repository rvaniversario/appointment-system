"use client";

import { useRouter } from "next/navigation";
import { PortalScreen } from "@/components/booking/screens/portal-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";

export default function PortalAppointmentsPage() {
  const router = useRouter();
  const {
    state,
    days,
    messagingAttorneyName,
    startReschedule,
    cancelAppointment,
    cancelRescheduleUI,
    setRescheduleDate,
    setRescheduleTime,
    confirmReschedule,
    onPortalMessageDraft,
    sendPortalMessage,
    addPortalDocument,
  } = usePortalSession();

  return (
    <PortalScreen
      activeTab="appointments"
      portal={state}
      days={days}
      messagingAttorneyName={messagingAttorneyName}
      onGoHome={() => router.push("/")}
      onReschedule={startReschedule}
      onCancel={cancelAppointment}
      onCancelRescheduleUI={cancelRescheduleUI}
      onSetRescheduleDate={setRescheduleDate}
      onSetRescheduleTime={setRescheduleTime}
      onConfirmReschedule={confirmReschedule}
      onMessageDraftChange={onPortalMessageDraft}
      onSendMessage={sendPortalMessage}
      onAddDocument={addPortalDocument}
    />
  );
}
