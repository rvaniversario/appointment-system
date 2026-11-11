"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestFirmReview } from "@/lib/firm/actions";
import type { FirmLaunchState } from "@/lib/firm/queries";
import { colors, errorTextStyle, primaryButton } from "@/lib/booking/ui";

const box = {
  background: "oklch(0.98 0.012 85)",
  border: "1px solid oklch(0.88 0.05 85)",
  borderRadius: 10,
  padding: "16px 18px",
  marginBottom: 24,
} as const;

const STEPS: { key: keyof FirmLaunchState["steps"]; text: string; href: string }[] = [
  { key: "attorney", text: "An attorney with their roll number and year admitted", href: "/staff/firm/attorneys" },
  { key: "consult", text: "At least one consultation type", href: "/staff/firm/consultations" },
  { key: "hours", text: "Weekly hours for an attorney", href: "/staff/availability" },
  { key: "contact", text: "The firm's contact email", href: "/staff/firm" },
];

/** Shown until the firm's booking page is live: what's left, and the request to go live. */
export function LaunchPanel({ state, isManager }: { state: FirmLaunchState; isManager: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (state.status === "suspended") {
    return (
      <div role="status" id="launch-panel" style={{ ...box, background: "oklch(0.97 0.02 25)", borderColor: "oklch(0.85 0.06 25)" }}>
        <strong>Your booking page is offline.</strong> The firm&apos;s account is suspended, so clients can&apos;t book. Contact
        support to restore it.
        {state.note && (
          <p data-testid="launch-note" style={{ margin: "8px 0 0", fontSize: 13.5 }}>
            Reason: {state.note}
          </p>
        )}
      </div>
    );
  }

  const done = Object.values(state.steps).every(Boolean);
  return (
    <section id="launch-panel" aria-labelledby="launch-heading" style={box}>
      <h2 id="launch-heading" style={{ fontSize: 16, fontWeight: 700, color: colors.navyDark, margin: "0 0 6px" }}>
        {state.reviewRequested ? "Your booking page is being reviewed" : "Set up your booking page"}
      </h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px", color: "oklch(0.42 0.01 258)" }}>
        {state.reviewRequested
          ? "We're checking the attorney's roll number against the Supreme Court's list of lawyers. Your page at "
          : "Clients can't see your page at "}
        <code>/f/{state.slug}</code>
        {state.reviewRequested
          ? " goes live once that's done. You can keep editing your settings in the meantime."
          : " yet. Finish these steps, then ask us to review it."}
      </p>
      {!state.reviewRequested && state.note && (
        <p
          data-testid="launch-note"
          role="status"
          style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 12px", padding: "8px 10px", background: "#fff", border: "1px solid oklch(0.88 0.05 85)", borderRadius: 8 }}
        >
          <strong>We couldn&apos;t approve it yet:</strong> {state.note} Make the change, then ask again.
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {STEPS.map((s) => (
          <li key={s.key} data-step={s.key} data-done={state.steps[s.key]} style={{ fontSize: 14, display: "flex", gap: 8 }}>
            <span
              role="img"
              aria-label={state.steps[s.key] ? "Done:" : "To do:"}
              style={{ color: state.steps[s.key] ? colors.green : "oklch(0.6 0.01 258)", fontWeight: 700 }}
            >
              {state.steps[s.key] ? "✓" : "○"}
            </span>
            <span>
              {state.steps[s.key] ? (
                s.text
              ) : (
                <Link href={s.href} style={{ color: colors.navyDark }}>
                  {s.text}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!state.reviewRequested &&
        (isManager ? (
          <>
            <button
              type="button"
              disabled={!done || pending}
              onClick={() =>
                start(async () => {
                  const result = await requestFirmReview();
                  setError(result.ok ? null : result.error);
                })
              }
              style={{ ...primaryButton, width: "auto", padding: "10px 18px", fontSize: 14, opacity: !done || pending ? 0.55 : 1 }}
            >
              {pending ? "Sending…" : "Ask to go live"}
            </button>
            {error && (
              <div role="alert" style={{ ...errorTextStyle, marginTop: 8 }}>
                {error}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13 }}>A partner or admin can ask for review once the steps are done.</div>
        ))}
    </section>
  );
}
