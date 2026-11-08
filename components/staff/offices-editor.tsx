"use client";

import { useState } from "react";
import { deleteOffice, saveOffice } from "@/lib/firm/actions";
import type { OfficeView } from "@/lib/firm/types";
import { card, colors } from "@/lib/booking/ui";
import { field, Labeled, quietButton, saveButton, SaveMessage, smallButton, useSave } from "./form-ui";

const blank: OfficeView = { id: "", name: "", address: "", isRemote: false, attorneyCount: 0 };

function OfficeForm({ office, onDone }: { office: OfficeView; onDone: () => void }) {
  const [name, setName] = useState(office.name);
  const [address, setAddress] = useState(office.address);
  const [isRemote, setIsRemote] = useState(office.isRemote);
  const { message, pending, run } = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveOffice({ id: office.id, name, address, isRemote }), "Saved.", onDone);
      }}
      style={{ display: "grid", gap: 12, marginTop: office.id ? 14 : 0 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <Labeled label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="Makati office" style={field} />
        </Labeled>
        <Labeled label="Address" hint="Shown to clients booking in-person consultations.">
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} style={field} />
        </Labeled>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={isRemote} onChange={(e) => setIsRemote(e.target.checked)} />
        Remote / video only (no address)
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={saveButton}>
          {pending ? "Saving…" : office.id ? "Save" : "Add office"}
        </button>
        {office.id && (
          <button type="button" onClick={onDone} style={{ ...quietButton, color: "oklch(0.5 0.01 258)" }}>
            Cancel
          </button>
        )}
        <SaveMessage message={message} />
      </div>
    </form>
  );
}

export function OfficesEditor({ offices }: { offices: OfficeView[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(offices.length === 0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = useSave();

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {offices.map((o) => (
          <div key={o.id} style={card("14px 18px")} data-testid="office">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: colors.navyDark }}>{o.name}</div>
                <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
                  {o.isRemote ? "Remote / video only" : o.address} · {o.attorneyCount} attorney{o.attorneyCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button type="button" onClick={() => setEditing(editing === o.id ? null : o.id)} style={smallButton}>
                  Edit
                </button>
                {confirming === o.id ? (
                  <>
                    <button type="button" onClick={() => setConfirming(null)} style={{ ...quietButton, color: "oklch(0.5 0.01 258)" }}>
                      Keep
                    </button>
                    <button type="button" onClick={() => remove.run(() => deleteOffice({ id: o.id }), "Deleted.")} style={{ ...quietButton, color: colors.errorText }}>
                      Yes, delete
                    </button>
                  </>
                ) : (
                  <button type="button" aria-label={`Delete ${o.name}`} onClick={() => setConfirming(o.id)} style={{ ...quietButton, color: "oklch(0.55 0.01 258)" }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            {confirming === o.id && o.attorneyCount > 0 && (
              <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)", marginTop: 8 }}>
                Its attorneys will have no office until you choose a new one.
              </div>
            )}
            {editing === o.id && <OfficeForm office={o} onDone={() => setEditing(null)} />}
          </div>
        ))}
      </div>
      <SaveMessage message={remove.message?.ok ? null : remove.message} />
      {adding ? (
        <div style={card()}>
          <OfficeForm key={offices.length} office={blank} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={smallButton}>
          + Add office
        </button>
      )}
    </div>
  );
}
