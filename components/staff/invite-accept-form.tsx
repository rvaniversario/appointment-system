"use client";

import { useState, useTransition } from "react";
import { PasswordInput } from "@/components/booking/password-input";
import { acceptInvite, sendInviteCode } from "@/lib/firm/invite-actions";
import { errorTextStyle, label, portalLoginFieldStyle, primaryButton } from "@/lib/booking/ui";

export function InviteAcceptForm({
  token,
  email,
  needsCode: needsCodeAtStart,
}: {
  token: string;
  email: string;
  /** The email already has an account and the visitor isn't signed in as it. */
  needsCode: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(needsCodeAtStart);
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const requestCode = () =>
    start(async () => {
      const result = await sendInviteCode({ token });
      if (result.ok) {
        setCodeSent(true);
        setError(null);
      } else setError(result.error);
    });

  const submit = () => {
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    start(async () => {
      // Redirects to two-factor setup on success.
      const result = await acceptInvite({ token, firstName, lastName, password, code });
      setError(result.error);
      if (result.needsCode) setNeedsCode(true);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div>
        <label style={label}>Email</label>
        <input value={email} readOnly style={{ ...portalLoginFieldStyle, background: "oklch(0.96 0.003 90)" }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="invite-first" style={label}>
            First name
          </label>
          <input id="invite-first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} style={portalLoginFieldStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="invite-last" style={label}>
            Last name
          </label>
          <input id="invite-last" required value={lastName} onChange={(e) => setLastName(e.target.value)} style={portalLoginFieldStyle} />
        </div>
      </div>
      <div>
        <label htmlFor="invite-password" style={label}>
          Choose a password
        </label>
        <PasswordInput id="invite-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={portalLoginFieldStyle} />
        <div style={{ fontSize: 12, color: "oklch(0.55 0.01 258)", marginTop: 4 }}>
          At least 12 characters, with an uppercase letter, a lowercase letter and a number.
        </div>
      </div>
      <div>
        <label htmlFor="invite-confirm" style={label}>
          Confirm password
        </label>
        <PasswordInput id="invite-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={portalLoginFieldStyle} />
      </div>

      {needsCode && (
        <div style={{ background: "oklch(0.97 0.01 258)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13.5 }}>
            {email} already has an account. To confirm it&apos;s yours, we&apos;ll email you a code.
          </div>
          {codeSent ? (
            <div>
              <label htmlFor="invite-code" style={label}>
                Code from your email
              </label>
              <input
                id="invite-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                maxLength={10}
                style={portalLoginFieldStyle}
              />
            </div>
          ) : (
            <button type="button" onClick={requestCode} disabled={pending} style={{ ...primaryButton, padding: "10px 0", fontSize: 14 }}>
              Email me a code
            </button>
          )}
        </div>
      )}

      {error && (
        <div role="alert" style={errorTextStyle}>
          {error}
        </div>
      )}
      <button type="submit" disabled={pending || (needsCode && !code)} style={{ ...primaryButton, opacity: pending || (needsCode && !code) ? 0.6 : 1 }}>
        {pending ? "Setting up…" : "Join and set up two-factor"}
      </button>
    </form>
  );
}
