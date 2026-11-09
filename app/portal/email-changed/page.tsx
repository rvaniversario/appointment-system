import Link from "next/link";
import { pageHeading, pageSub, primaryButton } from "@/lib/booking/ui";

export const metadata = { title: "Email change" };

const MESSAGES = {
  done: {
    heading: "Your email has been changed",
    body: "Sign in with your new address from now on. Booking emails will go there too.",
  },
  partial: {
    heading: "One more link to open",
    body: "We've confirmed this address. Now open the link we sent to your other address, and the change will be complete.",
  },
  failed: {
    heading: "That link didn't work",
    body: "It may have expired or already been used. Sign in and request the email change again from Account settings.",
  },
} as const;

/** Where the links in email change emails land (via /auth/confirm). Open to signed-out visitors. */
export default async function EmailChangedPage({ searchParams }: PageProps<"/portal/email-changed">) {
  const { status } = await searchParams;
  const message = MESSAGES[status === "done" || status === "partial" ? status : "failed"];

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "56px 32px 80px" }}>
      <h1 style={pageHeading}>{message.heading}</h1>
      <p style={{ ...pageSub, margin: "8px 0 24px" }}>{message.body}</p>
      <Link href="/portal/appointments" style={{ ...primaryButton, display: "inline-block", textDecoration: "none", padding: "12px 20px" }}>
        Go to your portal
      </Link>
    </div>
  );
}
