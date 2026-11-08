import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/booking/auto-refresh";
import { ConfirmationScreen } from "@/components/booking/screens/confirmation-screen";
import { getConfirmedBooking, refreshBookingPayment } from "@/lib/booking/confirmed";
import { getPublicFirm } from "@/lib/booking/queries";

function Message({ children, link }: { children: React.ReactNode; link?: { href: string; label: string } }) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px 80px", textAlign: "center" }}>
      <div style={{ fontSize: 15.5, lineHeight: 1.6, color: "oklch(0.45 0.01 258)", marginBottom: 20 }}>{children}</div>
      {link && (
        <Link href={link.href} style={{ color: "oklch(0.5 0.08 150)", fontWeight: 600 }}>
          {link.label}
        </Link>
      )}
    </div>
  );
}

/** Read from the server, so it survives a refresh and never trusts browser state. */
export default async function ConfirmationStepPage(props: PageProps<"/f/[firmSlug]/book/[attorneySlug]/confirmation">) {
  const { firmSlug, attorneySlug } = await props.params;
  const firm = await getPublicFirm(firmSlug);
  if (!firm) notFound();

  // Clients land here straight from PayMongo, often before the webhook arrives.
  const payment = await refreshBookingPayment(firm.id);
  const booking = await getConfirmedBooking(firm.id);

  if (!booking) {
    if (payment === "processing") {
      return (
        <Message>
          <AutoRefresh seconds={4} />
          <strong>Confirming your payment…</strong>
          <br />
          This usually takes a few seconds. You can leave this page open.
        </Message>
      );
    }
    if (payment === "paid_but_released") {
      return (
        <Message link={{ href: `/f/${firm.slug}`, label: "Back to the firm's page" }}>
          We received your payment, but your reserved time ran out before it went through and is no longer
          available. Please contact {firm.name} for a full refund or to choose a new time. The payment is
          flagged for their staff.
        </Message>
      );
    }
    return (
      <Message link={{ href: `/f/${firm.slug}/book/${attorneySlug}/time`, label: "Book a consultation" }}>
        We couldn&apos;t find a confirmed booking in this browser.
      </Message>
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
