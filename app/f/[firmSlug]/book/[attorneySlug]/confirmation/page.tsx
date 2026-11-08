import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmationScreen } from "@/components/booking/screens/confirmation-screen";
import { getConfirmedBooking } from "@/lib/booking/confirmed";
import { getPublicFirm } from "@/lib/booking/queries";

/** Read from the server, so it survives a refresh and never trusts browser state. */
export default async function ConfirmationStepPage(props: PageProps<"/f/[firmSlug]/book/[attorneySlug]/confirmation">) {
  const { firmSlug, attorneySlug } = await props.params;
  const firm = await getPublicFirm(firmSlug);
  if (!firm) notFound();
  const booking = await getConfirmedBooking(firm.id);

  if (!booking) {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px 80px", textAlign: "center" }}>
        <p style={{ fontSize: 15.5, color: "oklch(0.5 0.01 258)", marginBottom: 20 }}>
          We couldn&apos;t find a confirmed booking in this browser.
        </p>
        <Link href={`/f/${firm.slug}/book/${attorneySlug}/time`} style={{ color: "oklch(0.5 0.08 150)", fontWeight: 600 }}>
          Book a consultation
        </Link>
      </div>
    );
  }

  const where =
    booking.mode === "video"
      ? booking.meetingUrl ?? "The firm will send you a video link."
      : booking.mode === "in_person"
        ? booking.officeAddress
        : "The attorney will call the mobile number you gave.";

  return (
    <ConfirmationScreen
      firstName={booking.firstName}
      email={booking.email}
      attorneyName={booking.attorneyName}
      consultTypeLabel={booking.consultTypeLabel}
      dateLabel={booking.dateLabel}
      time={booking.timeLabel}
      where={where}
      meetingUrl={booking.mode === "video" ? booking.meetingUrl : null}
      icsHref={`/f/${firm.slug}/booking.ics`}
      directoryHref={`/f/${firm.slug}`}
    />
  );
}
