import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWizardProvider } from "@/components/booking/wizard/wizard-context";
import { WizardChrome } from "@/components/booking/wizard/wizard-chrome";
import { buildAgreement } from "@/lib/booking/agreement";
import { getConsultTypes, getFirmAgreementText, getFirmAttorney, getPublicFirm, getSlotPage } from "@/lib/booking/queries";
import { getSessionAccount } from "@/lib/auth/session";
import { formatMobile } from "@/lib/profile/mobile";

type Props = LayoutProps<"/f/[firmSlug]/book/[attorneySlug]">;

export const metadata: Metadata = { title: "Book a consultation", robots: { index: false } };

export default async function BookAttorneyLayout(props: Props) {
  const { firmSlug, attorneySlug } = await props.params;
  const firm = await getPublicFirm(firmSlug);
  const attorney = firm ? await getFirmAttorney(firm.id, attorneySlug) : null;
  if (!firm || !attorney) notFound();

  const [consultTypes, agreementText, session] = await Promise.all([
    getConsultTypes(firm.id),
    getFirmAgreementText(firm.id),
    getSessionAccount(),
  ]);
  const agreement = buildAgreement({ name: firm.name, agreementText });
  // With only one consultation type there's nothing to choose, so show its times right away.
  const initialSlots =
    consultTypes.length === 1
      ? await getSlotPage({ attorneyId: attorney.id, durationMinutes: consultTypes[0].durationMinutes })
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
      initialSlots={initialSlots}
    >
      <WizardChrome>{props.children}</WizardChrome>
    </BookingWizardProvider>
  );
}
