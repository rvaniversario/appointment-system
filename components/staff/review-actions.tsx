"use client";

import { useState, useTransition } from "react";
import { approveAppointment, declineAppointment, reassignAppointment } from "@/lib/staff/actions";
import { colors, errorTextStyle, secondaryButton } from "@/lib/booking/ui";

const smallButton = { ...secondaryButton, fontSize: 13.5, padding: "8px 14px" } as const;
const greenButton = { ...smallButton, border: "none", background: colors.green, color: "#fff" } as const;

export function ApproveButton({ appointmentId }: { appointmentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await approveAppointment({ appointmentId });
            setError(result.ok ? null : result.error);
          })
        }
        style={greenButton}
      >
        {pending ? "Approving…" : "Approve"}
      </button>
      {error && (
        <span role="alert" style={errorTextStyle}>
          {error}
        </span>
      )}
    </>
  );
}

/** Approve, decline or (for partners and admins) reassign a booking awaiting review. */
export function ReviewActions({
  appointmentId,
  canReassign,
  paid,
  options,
}: {
  appointmentId: string;
  canReassign: boolean;
  paid: boolean;
  options: { id: string; name: string; matchesCaseType: boolean }[];
}) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
      if (result.ok) setDeclining(false);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" disabled={pending} onClick={() => run(() => approveAppointment({ appointmentId }))} style={greenButton}>
          Approve
        </button>
        {canReassign && options.length > 0 && (
          <>
            <select
              aria-label="Reassign to"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid oklch(0.85 0.005 90)", borderRadius: 7, fontSize: 13.5, background: "#fff" }}
            >
              <option value="">Reassign to…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.matchesCaseType ? " (practices this area)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!target || pending}
              onClick={() => run(() => reassignAppointment({ appointmentId, attorneyId: target }))}
              style={{ ...smallButton, opacity: target ? 1 : 0.5, cursor: target ? "pointer" : "not-allowed" }}
            >
              Reassign
            </button>
          </>
        )}
        <button type="button" disabled={pending} onClick={() => setDeclining(true)} style={{ ...smallButton, color: colors.errorText }}>
          Decline
        </button>
      </div>

      {declining && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ fontSize: 13.5, color: colors.ink }}>
            Reason, for the firm&apos;s records (the client isn&apos;t shown this)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "9px 12px",
                border: "1px solid oklch(0.85 0.005 90)",
                borderRadius: 7,
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
          </label>
          {paid && (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
              The client paid online. Billing will show the fee as a refund due.
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setDeclining(false)} style={{ ...smallButton, fontWeight: 400 }}>
              Keep booking
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => declineAppointment({ appointmentId, reason }))}
              style={{ ...smallButton, border: "none", background: colors.errorText, color: "#fff" }}
            >
              {pending ? "Declining…" : "Decline booking"}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" style={errorTextStyle}>
          {error}
        </div>
      )}
    </div>
  );
}
