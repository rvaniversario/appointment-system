"use client";

import { useState, useTransition } from "react";
import { addConflictParty, removeConflictParty } from "@/lib/staff/actions";
import { colors, errorTextStyle, secondaryButton } from "@/lib/booking/ui";

const input = {
  padding: "9px 12px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  boxSizing: "border-box" as const,
};

/** Adds a party to the firm's conflict records. Partners and admins only. */
export function AddConflictParty({ attorneys }: { attorneys: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [matter, setMatter] = useState("");
  const [attorneyId, setAttorneyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await addConflictParty({ name, matter, attorneyId });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          setName("");
          setMatter("");
          setAttorneyId("");
        });
      }}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      <input aria-label="Party name" placeholder="Party name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} style={{ ...input, flex: "1 1 180px" }} />
      <input aria-label="Matter" placeholder="Matter, e.g. Cruz v. Santos" value={matter} onChange={(e) => setMatter(e.target.value)} maxLength={300} style={{ ...input, flex: "2 1 220px" }} />
      <select aria-label="Attorney on the matter" value={attorneyId} onChange={(e) => setAttorneyId(e.target.value)} style={{ ...input, background: "#fff" }}>
        <option value="">Attorney (optional)</option>
        {attorneys.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} style={{ ...secondaryButton, fontSize: 13.5 }}>
        {pending ? "Adding…" : "Add party"}
      </button>
      {error && (
        <div role="alert" style={{ ...errorTextStyle, width: "100%" }}>
          {error}
        </div>
      )}
    </form>
  );
}

export function RemoveConflictParty({ partyId, name }: { partyId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name}`}
        style={{ border: "none", background: "none", color: "oklch(0.55 0.01 258)", fontSize: 13, cursor: "pointer" }}
      >
        Remove
      </button>
    );
  }
  return (
    <span style={{ display: "flex", gap: 8 }}>
      <button type="button" onClick={() => setConfirming(false)} style={{ border: "none", background: "none", fontSize: 13, cursor: "pointer" }}>
        Keep
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void (await removeConflictParty({ partyId })))}
        style={{ border: "none", background: "none", color: colors.errorText, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        {pending ? "Removing…" : "Yes, remove"}
      </button>
    </span>
  );
}
