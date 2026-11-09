"use client";

import { useState, useTransition } from "react";
import { requestEmailChange } from "@/lib/profile/actions";
import { linkButton, secondaryButton, settingsFieldStyle } from "@/lib/booking/ui";

const noteStyle = { fontSize: 12.5, color: "oklch(0.5 0.01 258)", marginTop: 6 } as const;

/**
 * Lets a client change their sign-in email. Links go to both addresses, and nothing changes
 * until both are opened, so the form only ever says what was sent.
 */
export function EmailChange({ pendingEmail }: { pendingEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await requestEmailChange(email);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSentTo(email.trim().toLowerCase());
      setOpen(false);
      setEmail("");
    });
  };

  const waitingFor = sentTo ?? pendingEmail;

  return (
    <div>
      {waitingFor && !open && (
        <div role="status" style={noteStyle}>
          To change your email to {waitingFor}, open the links we sent to both your current address and{" "}
          {waitingFor}. Your email stays the same until both are opened.
        </div>
      )}
      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={{ ...linkButton, marginTop: 6, fontSize: 13 }}>
          {waitingFor ? "Use a different new email" : "Change email"}
        </button>
      )}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}
        >
          <label htmlFor="new-email" style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.01 258)" }}>
            New email
          </label>
          <input
            id="new-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={settingsFieldStyle}
          />
          {error && (
            <div role="alert" style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" disabled={pending} style={{ ...secondaryButton, opacity: pending ? 0.7 : 1 }}>
              {pending ? "Sending…" : "Send confirmation links"}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={linkButton}>
              Cancel
            </button>
          </div>
          <div style={noteStyle}>We&apos;ll email a link to your current address and to the new one. Open both to finish.</div>
        </form>
      )}
    </div>
  );
}
