import Link from "next/link";
import { linkButton } from "@/lib/booking/ui";

interface ConfirmationScreenProps {
  firstName: string;
  email: string;
  attorneyName: string;
  consultTypeLabel: string;
  dateLabel: string;
  time: string;
  /** Where the consultation happens: a meeting link, an office address, or a phone call. */
  where: string | null;
  meetingUrl: string | null;
  icsHref: string;
  directoryHref: string;
}

export function ConfirmationScreen({
  firstName,
  email,
  attorneyName,
  consultTypeLabel,
  dateLabel,
  time,
  where,
  meetingUrl,
  icsHref,
  directoryHref,
}: ConfirmationScreenProps) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px 80px", textAlign: "center" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "oklch(0.5 0.08 150)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <div
          style={{
            width: 18,
            height: 10,
            borderLeft: "3px solid #fff",
            borderBottom: "3px solid #fff",
            transform: "rotate(-45deg) translate(2px,-2px)",
          }}
        />
      </div>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 28,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 8px",
        }}
      >
        You&apos;re all set{firstName ? `, ${firstName}` : ""}
      </h1>
      <p style={{ fontSize: 15.5, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>
        Your consultation is confirmed. Sign in to your client portal with {email || "your email"} to see it
        anytime.
      </p>

      <div
        style={{
          background: "#fff",
          border: "1px solid oklch(0.9 0.005 90)",
          borderRadius: 12,
          padding: "22px 24px",
          textAlign: "left",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)", marginBottom: 4 }}>
          {consultTypeLabel}
        </div>
        <div style={{ fontSize: 14.5, color: "oklch(0.45 0.01 258)", marginBottom: 2 }}>with {attorneyName}</div>
        <div style={{ fontSize: 14.5, color: "oklch(0.45 0.01 258)", marginBottom: where ? 2 : 14 }}>
          {dateLabel} at {time} (Philippine time)
        </div>
        {where && (
          <div style={{ fontSize: 14.5, color: "oklch(0.45 0.01 258)", marginBottom: 14, wordBreak: "break-word" }}>
            {meetingUrl ? (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "oklch(0.5 0.08 150)" }}>
                {where}
              </a>
            ) : (
              where
            )}
          </div>
        )}
        <a
          href={icsHref}
          download
          style={{
            display: "inline-block",
            padding: "9px 14px",
            border: "1px solid oklch(0.85 0.005 90)",
            borderRadius: 7,
            background: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
            color: "oklch(0.28 0.05 258)",
            textDecoration: "none",
          }}
        >
          Download .ics calendar file
        </a>
      </div>

      <div style={{ textAlign: "left", marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 10 }}>
          What happens next
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.7, color: "oklch(0.4 0.01 258)" }}>
          <div>• {attorneyName} will review your intake before your consultation.</div>
          <div>• Bring any documents you&apos;d like to discuss, even if not uploaded.</div>
          <div>• Need to change something? Contact the firm before your appointment.</div>
        </div>
      </div>

      <Link href={directoryHref} style={{ ...linkButton, textDecoration: "none" }}>
        Return to the firm&apos;s page
      </Link>
    </div>
  );
}
