"use client";

import { getNext7Days } from "@/lib/booking/data";
import { BookTimeScreen } from "@/components/booking/screens/book-time-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function TimeStepPage() {
  const { attorney, state, setConsultType, setDate, setTime, goToIntake } = useWizard();

  return (
    <BookTimeScreen
      attorney={attorney}
      booking={state.booking}
      days={getNext7Days()}
      onSetConsultType={setConsultType}
      onSetDate={setDate}
      onSetTime={setTime}
      onContinue={goToIntake}
    />
  );
}
