"use client";

import { BookTimeScreen } from "@/components/booking/screens/book-time-screen";
import { useWizard } from "@/components/booking/wizard/wizard-context";

export default function TimeStepPage() {
  const { attorney, consultTypes, state, slots, setConsultType, showWeek, setDate, setTime, goToIntake } = useWizard();

  return (
    <BookTimeScreen
      attorneyName={attorney.name}
      consultTypes={consultTypes}
      booking={state.booking}
      slots={slots}
      notice={state.notice}
      pending={state.pending}
      onSetConsultType={setConsultType}
      onShowWeek={showWeek}
      onSetDate={setDate}
      onSetTime={setTime}
      onContinue={goToIntake}
    />
  );
}
