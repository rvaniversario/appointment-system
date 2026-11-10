"use client";

import { useState } from "react";
import { firmAction, setAttorneyCheck, setComp } from "@/lib/admin/actions";
import { field, Labeled, SaveMessage, saveButton, smallButton, useSave } from "@/components/staff/form-ui";
import { colors } from "@/lib/booking/ui";
import type { FirmStage } from "@/lib/admin/queries";

/** Marks one attorney's roll number and year as checked, or removes the check. */
export function AttorneyCheck({ firmId, attorneyId, name, checked, canCheck }: { firmId: string; attorneyId: string; name: string; checked: boolean; canCheck: boolean }) {
  const { message, pending, run } = useSave();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {checked ? (
        <button type="button" style={smallButton} disabled={pending} onClick={() => run(() => setAttorneyCheck({ firmId, attorneyId, checked: false }), "Check removed.")}>
          Remove check
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Mark ${name} as checked`}
          style={{ ...saveButton, fontSize: 13, padding: "7px 12px", opacity: canCheck && !pending ? 1 : 0.55 }}
          disabled={!canCheck || pending}
          onClick={() => run(() => setAttorneyCheck({ firmId, attorneyId, checked: true }), "Checked.")}
        >
          Mark as checked
        </button>
      )}
      <SaveMessage message={message} />
    </span>
  );
}

const danger = { ...saveButton, background: colors.errorTextAlt } as const;

/** Approve, send back, suspend or reinstate. A note is required to send back or suspend. */
export function FirmDecision({ firmId, stage, canApprove }: { firmId: string; stage: FirmStage; canApprove: boolean }) {
  const [note, setNote] = useState("");
  const { message, pending, run } = useSave();
  const act = (action: "approve" | "send_back" | "suspend" | "reinstate", done: string) =>
    run(() => firmAction({ firmId, action, note }), done, () => setNote(""));
  const pendingFirm = stage === "review" || stage === "setup";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {stage !== "suspended" && (
        <Labeled label="Note to the firm" hint="Required to send back or suspend. The firm's partners and admins see it in their dashboard and by email.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} style={{ ...field, resize: "vertical" }} />
        </Labeled>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {pendingFirm && (
          <button type="button" style={{ ...saveButton, opacity: canApprove && !pending ? 1 : 0.55 }} disabled={!canApprove || pending} onClick={() => act("approve", "Approved. The booking page is live.")}>
            Approve and go live
          </button>
        )}
        {pendingFirm && (
          <button type="button" style={smallButton} disabled={pending} onClick={() => act("send_back", "Sent back to the firm.")}>
            Send back
          </button>
        )}
        {stage !== "suspended" && (
          <button type="button" style={danger} disabled={pending} onClick={() => act("suspend", "Suspended.")}>
            Suspend
          </button>
        )}
        {stage === "suspended" && (
          <button type="button" style={saveButton} disabled={pending} onClick={() => act("reinstate", "Reinstated.")}>
            Reinstate
          </button>
        )}
        <SaveMessage message={message} />
      </div>
    </div>
  );
}

/** Free use, with an optional end date. Phase 8 treats a comped firm as paid until then. */
export function CompForm({ firmId, comped, until, note }: { firmId: string; comped: boolean; until: string | null; note: string | null }) {
  const [on, setOn] = useState(comped);
  const [date, setDate] = useState(until ?? "");
  const [text, setText] = useState(note ?? "");
  const { message, pending, run } = useSave();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setComp({ firmId, comped: on, until: on ? date : "", note: text }), on ? "Comp saved." : "Comp ended.");
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        Comped (free use)
      </label>
      {on && (
        <Labeled label="Free until" hint="Leave blank for no end date.">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...field, maxWidth: 220 }} />
        </Labeled>
      )}
      <Labeled label="Internal note" hint="Only operators see this.">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} style={field} />
      </Labeled>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" style={saveButton} disabled={pending}>
          Save comp
        </button>
        <SaveMessage message={message} />
      </div>
    </form>
  );
}
