import Link from "next/link";
import { SignupForm } from "@/components/signup/signup-form";
import { publicEnv } from "@/lib/env";
import { colors } from "@/lib/booking/ui";
import { PLATFORM } from "@/lib/brand";

export const metadata = { title: "Sign up your firm" };

/** Firm self-service signup. The new firm can set up its dashboard right away; its booking page goes live after review. */
export default function SignupPage() {
  const siteHost = new URL(publicEnv.NEXT_PUBLIC_SITE_URL).host;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 16px 80px" }}>
      <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: 28, fontWeight: 600, color: colors.navyDark, margin: "0 0 8px" }}>
        Sign up your firm
      </h1>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>
        Create your firm&apos;s {PLATFORM.name} account. You can set up consultations and hours right away. Your booking page
        goes live once we&apos;ve checked the attorney&apos;s roll number.
      </p>
      <SignupForm siteHost={siteHost} />
      <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", marginTop: 28 }}>
        Already have an account?{" "}
        <Link href="/staff/login" style={{ color: colors.green, fontWeight: 600 }}>
          Firm sign-in
        </Link>
      </p>
    </div>
  );
}
