"use client";

import { PLATFORM } from "@/lib/brand";

interface FooterProps {
  /** Hides the staff sign-in link. */
  signedIn: boolean;
  onOpenAdmin: () => void;
  /** Set on a firm's own pages. */
  firmName?: string;
}

export function Footer({ signedIn, onOpenAdmin, firmName }: FooterProps) {
  return (
    <footer
      style={{
        borderTop: "1px solid oklch(0.9 0.005 90)",
        padding: "20px 32px",
        textAlign: "center",
        fontSize: 12.5,
        color: "oklch(0.6 0.01 258)",
        position: "relative",
      }}
    >
      {firmName
        ? `${firmName} — this consultation booking does not establish an attorney-client relationship until an engagement letter is signed.`
        : `${PLATFORM.name} — online consultation booking for Philippine law firms.`}
      {!signedIn && (
        <button
          onClick={onOpenAdmin}
          style={{
            position: "absolute",
            right: 24,
            bottom: 18,
            border: "none",
            background: "none",
            color: "oklch(0.75 0.005 90)",
            fontSize: 10.5,
            cursor: "pointer",
          }}
        >
          Staff sign-in
        </button>
      )}
    </footer>
  );
}
