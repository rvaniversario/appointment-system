import { notFound } from "next/navigation";
import { ATTORNEYS, getAttorney } from "@/lib/booking/data";
import { BookingWizardProvider } from "@/components/booking/wizard/wizard-context";
import { WizardChrome } from "@/components/booking/wizard/wizard-chrome";

export function generateStaticParams() {
  return ATTORNEYS.map((a) => ({ attorneyId: a.id }));
}

export default async function BookAttorneyLayout(props: LayoutProps<"/book/[attorneyId]">) {
  const { attorneyId } = await props.params;
  const attorney = getAttorney(attorneyId);
  if (!attorney) notFound();

  return (
    <BookingWizardProvider attorney={attorney}>
      <WizardChrome>{props.children}</WizardChrome>
    </BookingWizardProvider>
  );
}
