import Link from "next/link";
import { InviteAcceptForm } from "@/components/staff/invite-accept-form";
import { lookupInvite } from "@/lib/firm/queries";
import { colors } from "@/lib/booking/ui";

export const metadata = { title: "Join your firm", robots: { index: false, follow: false } };

const ROLE = { attorney: "an attorney", partner: "a partner", admin: "an admin" } as const;

const MESSAGES = {
  expired: "This invite has expired. Ask the firm's partner or admin for a new link.",
  used: "This invite has already been used. If it was you, sign in.",
  invalid: "This invite link isn't valid. Check you copied all of it, or ask the firm for a new one.",
} as const;

export default async function StaffInvitePage({ params }: PageProps<"/staff/invite/[token]">) {
  const { token } = await params;
  const invite = await lookupInvite(token);

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "56px 24px 80px" }}>
      <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: 26, fontWeight: 600, color: colors.navyDark, margin: "0 0 8px" }}>
        {invite.state === "open" ? `Join ${invite.firmName}` : "Staff invite"}
      </h1>
      {invite.state === "open" ? (
        <>
          <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 24px" }}>
            You&apos;ve been invited as {ROLE[invite.role]}. Set up your account, then add an authenticator app: every staff
            sign-in needs a code from it.
          </p>
          <InviteAcceptForm token={token} email={invite.email} needsCode={invite.hasAccount && !invite.signedInAsInvitee} />
        </>
      ) : (
        <>
          <p role="alert" style={{ fontSize: 15, color: "oklch(0.45 0.01 258)", margin: "0 0 20px" }}>
            {MESSAGES[invite.state]}
          </p>
          <Link href="/staff/login" style={{ color: colors.green, fontWeight: 600 }}>
            Go to staff sign-in
          </Link>
        </>
      )}
    </div>
  );
}
