"use client";

import { useState, useTransition } from "react";
import { changeMemberRole, createInvite, removeMember, revokeInvite } from "@/lib/firm/actions";
import type { InviteView, MemberView } from "@/lib/firm/types";
import type { FirmRole } from "@/lib/supabase/database.types";
import { badge, card, colors, errorTextStyle } from "@/lib/booking/ui";
import { field, Labeled, Panel, quietButton, saveButton, SaveMessage, smallButton, useSave } from "./form-ui";

const ROLES: { value: FirmRole; label: string; hint: string }[] = [
  { value: "attorney", label: "Attorney", hint: "Their own bookings, clients, messages and hours" },
  { value: "partner", label: "Partner", hint: "The whole firm, billing and refunds, settings and staff" },
  { value: "admin", label: "Admin", hint: "The same as a partner" },
];
const roleLabel = (role: FirmRole) => ROLES.find((r) => r.value === role)?.label ?? role;

function MemberRow({ member }: { member: MemberView }) {
  const [role, setRole] = useState<FirmRole>(member.role);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, revert?: () => void) =>
    start(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
      if (!result.ok) revert?.();
    });

  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid oklch(0.94 0.005 90)" }} data-testid="member">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: colors.navyDark }}>
            {member.name} {member.isYou && <span style={badge("grey")}>You</span>}
          </div>
          <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
            {member.email}
            {member.attorneyName ? ` · Attorney profile: ${member.attorneyName}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {member.isYou ? (
            <span style={{ fontSize: 13.5 }}>{roleLabel(member.role)}</span>
          ) : (
            <select
              aria-label={`Role for ${member.name}`}
              value={role}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value as FirmRole;
                setRole(next);
                act(() => changeMemberRole({ profileId: member.profileId, role: next }), () => setRole(member.role));
              }}
              style={{ ...field, width: "auto" }}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          {!member.isYou &&
            (confirming ? (
              <>
                <button type="button" onClick={() => setConfirming(false)} style={{ ...quietButton, color: "oklch(0.5 0.01 258)" }}>
                  Keep
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => removeMember({ profileId: member.profileId }))} style={{ ...quietButton, color: colors.errorText }}>
                  Yes, remove access
                </button>
              </>
            ) : (
              <button type="button" aria-label={`Remove ${member.name}`} onClick={() => setConfirming(true)} style={{ ...quietButton, color: "oklch(0.55 0.01 258)" }}>
                Remove
              </button>
            ))}
        </div>
      </div>
      {confirming && (
        <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)", marginTop: 6 }}>
          They lose staff access at once. Their attorney profile and past bookings stay with the firm.
        </div>
      )}
      {error && (
        <div role="alert" style={{ ...errorTextStyle, marginTop: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function InviteForm({ unlinkedAttorneys }: { unlinkedAttorneys: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<FirmRole>("attorney");
  const [attorneyId, setAttorneyId] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { message, pending, run } = useSave();

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLink(null);
          run(async () => {
            const result = await createInvite({ email, role, attorneyId: role === "attorney" ? attorneyId : "" });
            if (!result.ok) return result;
            setLink(result.link);
            setCopied(false);
            setEmail("");
            setAttorneyId("");
            return { ok: true };
          }, "Invite created.");
        }}
        style={{ display: "grid", gap: 12 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Labeled label="Email">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} style={field} />
          </Labeled>
          <Labeled label="Role" hint={ROLES.find((r) => r.value === role)?.hint}>
            <select value={role} onChange={(e) => setRole(e.target.value as FirmRole)} style={field}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Labeled>
        </div>
        {role === "attorney" && unlinkedAttorneys.length > 0 && (
          <Labeled label="Attorney profile" hint="They'll see this attorney's bookings and clients.">
            <select value={attorneyId} onChange={(e) => setAttorneyId(e.target.value)} style={field}>
              <option value="">None for now</option>
              {unlinkedAttorneys.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" disabled={pending} style={saveButton}>
            {pending ? "Creating…" : "Create invite link"}
          </button>
          <SaveMessage message={message?.ok ? null : message} />
        </div>
      </form>

      {link && (
        <div role="status" style={{ ...card("14px 16px"), marginTop: 14, background: "oklch(0.97 0.02 150)" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
            Send this link to them yourself. It works once, for 7 days, and won&apos;t be shown again.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} style={{ ...field, fontFamily: "monospace", fontSize: 12.5 }} />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
              style={smallButton}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StaffManager({
  members,
  invites,
  unlinkedAttorneys,
}: {
  members: MemberView[];
  invites: InviteView[];
  unlinkedAttorneys: { id: string; name: string }[];
}) {
  const revoke = useSave();
  return (
    <>
      <Panel title="Invite someone">
        <InviteForm unlinkedAttorneys={unlinkedAttorneys} />
      </Panel>

      {invites.length > 0 && (
        <Panel title="Open invites">
          {invites.map((i) => (
            <div key={i.id} data-testid="invite" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid oklch(0.94 0.005 90)", fontSize: 14 }}>
              <span>
                {i.email} · {roleLabel(i.role)}
                {i.attorneyName ? ` · ${i.attorneyName}` : ""}
                <span style={{ fontSize: 12.5, color: i.expired ? colors.errorText : "oklch(0.55 0.01 258)" }}>
                  {" "}
                  · {i.expired ? `Expired ${i.expiresLabel}` : `Sent ${i.invitedLabel}, expires ${i.expiresLabel}`}
                </span>
              </span>
              <button type="button" aria-label={`Revoke invite for ${i.email}`} onClick={() => revoke.run(() => revokeInvite({ inviteId: i.id }), "Revoked.")} style={{ ...quietButton, color: "oklch(0.55 0.01 258)" }}>
                {i.expired ? "Clear" : "Revoke"}
              </button>
            </div>
          ))}
          <SaveMessage message={revoke.message?.ok ? null : revoke.message} />
        </Panel>
      )}

      <Panel title={`Staff (${members.length})`}>
        {members.map((m) => (
          <MemberRow key={m.profileId} member={m} />
        ))}
        <p style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", margin: "12px 0 0" }}>
          The firm always keeps at least one partner or admin. Nobody can change their own role or remove themselves.
        </p>
      </Panel>
    </>
  );
}
