"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header, type StepperItem } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { firmBrand } from "@/lib/brand";
import { BOOKING_STEP_LABELS, BOOKING_STEP_ORDER } from "@/lib/booking/wizard";
import { useHeaderUserMenu } from "@/components/auth/use-header-user-menu";
import { useWizard } from "./wizard-context";

export function WizardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { firm, attorney, state, basePath } = useWizard();
  const { userMenu, userMenuOpen, toggleUserMenu } = useHeaderUserMenu();
  const bookPath = `${basePath}/book/${attorney.slug}`;

  const currentStep = pathname.split("/").pop() ?? "";
  const stepIdx = BOOKING_STEP_ORDER.indexOf(currentStep as (typeof BOOKING_STEP_ORDER)[number]);

  // Steps only open in order. The confirmation page reads the booking from the server instead.
  useEffect(() => {
    if (currentStep === "time" || currentStep === "confirmation") return;
    if (!state.held) return router.replace(`${bookPath}/time`);
    if (currentStep !== "intake" && !state.intakeSaved) return router.replace(`${bookPath}/intake`);
    if ((currentStep === "payment" || currentStep === "video") && !state.agreementSigned) {
      router.replace(`${bookPath}/agreement`);
    }
  }, [currentStep, state.held, state.intakeSaved, state.agreementSigned, bookPath, router]);

  const stepper: StepperItem[] | null =
    stepIdx >= 0
      ? BOOKING_STEP_LABELS.map((label, idx) => ({
          label,
          state: idx < stepIdx ? "done" : idx === stepIdx ? "current" : "todo",
          onClick: idx < stepIdx ? () => router.push(`${bookPath}/${BOOKING_STEP_ORDER[idx]}`) : undefined,
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
        brand={firmBrand(firm)}
        onGoHome={() => router.push(basePath)}
        stepper={stepper}
        userMenu={userMenu}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={toggleUserMenu}
        showBackLink={currentStep === "video"}
        onOpenPortal={() => router.push("/portal/login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer firmName={firm.name} signedIn={Boolean(userMenu)} onOpenAdmin={() => router.push("/staff/login")} />
    </div>
  );
}
