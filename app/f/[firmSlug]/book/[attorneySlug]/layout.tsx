import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWizardProvider } from "@/components/booking/wizard/wizard-context";
import { WizardChrome } from "@/components/booking/wizard/wizard-chrome";
import { buildAgreement } from "@/lib/booking/agreement";
import { getConsultTypes, getFirmAgreementSettings, getFirmAttorney, getPublicFirm, getSlotPage } from "@/lib/booking/queries";
import { getSessionAccount } from "@/lib/auth/session";
import { formatMobile } from "@/lib/profile/mobile";
import { getResumableBooking } from "@/lib/booking/resume";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentsConfigured } from "@/lib/env.server";

type Props = LayoutProps<"/f/[firmSlug]/book/[attorneySlug]">;

export const metadata: Metadata = { title: "Book a consultation", robots: { index: false } };

export default async function BookAttorneyLayout(props: Props) {
  const { firmSlug, attorneySlug } = await props.params;
  const firm = await getPublicFirm(firmSlug);
  const attorney = firm ? await getFirmAttorney(firm.id, attorneySlug) : null;
  if (!firm || !attorney) notFound();

  const [consultTypes, agreementSettings, session, resume, { data: acceptsPayments }] = await Promise.all([
    getConsultTypes(firm.id),
    getFirmAgreementSettings(firm.id),
    getSessionAccount(),
    getResumableBooking(firm.id, attorney.id),
    createAdminClient().rpc("firm_accepts_payments", { p_firm: firm.id }),
  ]);
  const agreement = buildAgreement({ name: firm.name, ...agreementSettings });
  // With only one consultation type there's nothing to choose, so show its times right away.
  const initialSlots =
    consultTypes.length === 1
      ? await getSlotPage({ attorneyId: attorney.id, durationMinutes: consultTypes[0].durationMinutes })
      : null;
  // Re-opening a booking in progress shows the week of its chosen time.
  const resumeType = resume && consultTypes.find((c) => c.id === resume.consultTypeId);
  const resumeSlots =
    resume && resumeType
      ? await getSlotPage({ attorneyId: attorney.id, durationMinutes: resumeType.durationMinutes, fromDate: resume.date })
      : null;

  // Signed-in clients don't retype what their profile already has.
  const prefill = session
    ? { firstName: session.firstName, lastName: session.lastName, email: session.email, phone: formatMobile(session.mobile) }
    : {};

  return (
    <BookingWizardProvider
      firm={firm}
      attorney={attorney}
      consultTypes={consultTypes}
      agreementParagraphs={agreement.paragraphs}
      prefill={prefill}
      initialSlots={resumeSlots ?? initialSlots}
      resume={resume}
      acceptsPayments={Boolean(acceptsPayments) && paymentsConfigured()}
    >
      <WizardChrome>{props.children}</WizardChrome>
    </BookingWizardProvider>
  );
}
