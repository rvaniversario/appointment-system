"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header, type StepperItem } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { BOOKING_STEP_LABELS, BOOKING_STEP_ORDER, isAgreementStepComplete, isTimeStepComplete } from "@/lib/booking/wizard";
import { useHeaderUserMenu } from "@/components/auth/use-header-user-menu";
import { useWizard } from "./wizard-context";

export function WizardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { attorney, state } = useWizard();
  const { userMenu, userMenuOpen, toggleUserMenu } = useHeaderUserMenu();

  const currentStep = pathname.split("/").pop() ?? "";
  const stepIdx = BOOKING_STEP_ORDER.indexOf(currentStep as (typeof BOOKING_STEP_ORDER)[number]);

  useEffect(() => {
    const timeReady = isTimeStepComplete(state);
    if (currentStep !== "time" && !timeReady) {
      router.replace(`/book/${attorney.id}/time`);
      return;
    }
    if ((currentStep === "payment" || currentStep === "video") && !isAgreementStepComplete(state)) {
      router.replace(`/book/${attorney.id}/agreement`);
    }
  }, [currentStep, state, attorney.id, router]);

  const stepper: StepperItem[] | null =
    stepIdx >= 0
      ? BOOKING_STEP_LABELS.map((label, idx) => ({
          label,
          state: idx < stepIdx ? "done" : idx === stepIdx ? "current" : "todo",
          onClick: idx < stepIdx ? () => router.push(`/book/${attorney.id}/${BOOKING_STEP_ORDER[idx]}`) : undefined,
        }))
      : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "var(--font-public-sans), sans-serif",
        color: "oklch(0.32 0.01 258)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        onGoHome={() => router.push("/")}
        stepper={stepper}
        userMenu={userMenu}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={toggleUserMenu}
        showBackLink={currentStep === "video"}
        onOpenPortal={() => router.push("/portal/login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer signedIn={Boolean(userMenu)} onOpenAdmin={() => router.push("/staff/login")} />
    </div>
  );
}
