"use client";

import { getNext7Days } from "@/lib/booking/data";
import { getBookingSummary } from "@/lib/booking/wizard";
import { BookVideoScreen } from "@/components/booking/screens/book-video-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function VideoStepPage() {
  const { state, toggleCameraCheck, toggleMicCheck, finishVideoCheck } = useWizard();
  const { dateLabel } = getBookingSummary(state, getNext7Days());

  return (
    <BookVideoScreen
      dateLabel={dateLabel}
      cameraOk={state.cameraOk}
      micOk={state.micOk}
      onToggleCamera={toggleCameraCheck}
      onToggleMic={toggleMicCheck}
      onFinish={finishVideoCheck}
    />
  );
}
