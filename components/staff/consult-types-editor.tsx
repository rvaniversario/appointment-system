"use client";

import { useState } from "react";
import { moveConsultType, saveConsultType } from "@/lib/firm/actions";
import type { ConsultTypeView } from "@/lib/firm/types";
import type { ConsultMode } from "@/lib/supabase/database.types";
import { badge, card, colors } from "@/lib/booking/ui";
import { field, Labeled, quietButton, saveButton, SaveMessage, smallButton, useSave } from "./form-ui";

const MODES: { value: ConsultMode; label: string }[] = [
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
  { value: "in_person", label: "In person" },
];
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

const blank: ConsultTypeView = {
  id: "",
  label: "",
  description: "",
  mode: "video",
  durationMinutes: 30,
  pricePesos: "0",
  priceLabel: "Free",
  isActive: true,
  inUse: false,
};

function ConsultTypeForm({ type, onDone }: { type: ConsultTypeView; onDone: () => void }) {
  const [label, setLabel] = useState(type.label);
  const [description, setDescription] = useState(type.description);
  const [mode, setMode] = useState<ConsultMode>(type.mode);
  const [duration, setDuration] = useState(type.durationMinutes);
  const [price, setPrice] = useState(type.pricePesos);
  const [isActive, setIsActive] = useState(type.isActive);
  const { message, pending, run } = useSave();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveConsultType({ id: type.id, label, description, mode, durationMinutes: duration, pricePesos: price, isActive }),
          "Saved.",
          onDone,
        );
      }}
      style={{ display: "grid", gap: 12, marginTop: type.id ? 14 : 0 }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
        <Labeled label="Name">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} required placeholder="30-min Video Consultation" style={field} />
        </Labeled>
        <Labeled label="How">
          <select value={mode} onChange={(e) => setMode(e.target.value as ConsultMode)} style={field}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Length">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={field}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Price (₱)" hint="0 for free">
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} style={field} aria-label="Price in pesos" />
        </Labeled>
      </div>
      <Labeled label="Description" hint="Shown to clients when they choose a consultation.">
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} style={field} />
      </Labeled>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Clients can book this
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={saveButton}>
          {pending ? "Saving…" : type.id ? "Save" : "Add consultation type"}
        </button>
        {type.id && (
          <button type="button" onClick={onDone} style={{ ...quietButton, color: "oklch(0.5 0.01 258)" }}>
            Cancel
          </button>
        )}
        <SaveMessage message={message} />
      </div>
    </form>
  );
}

export function ConsultTypesEditor({ types, acceptsPayments }: { types: ConsultTypeView[]; acceptsPayments: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(types.length === 0);

  return (
    <div>
      {!acceptsPayments && types.some((t) => t.pricePesos !== "0" && t.isActive) && (
        <div role="note" style={{ background: "oklch(0.97 0.02 85)", border: "1px solid oklch(0.88 0.06 85)", borderRadius: 8, padding: "10px 14px", fontSize: 13.5, marginBottom: 14 }}>
          Your firm isn&apos;t connected to PayMongo yet, so paid consultations can&apos;t be booked online. Free ones can.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {types.map((t, i) => (
          <div key={t.id} style={card("14px 18px")} data-testid="consult-type">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.isActive ? colors.navyDark : "oklch(0.55 0.01 258)" }}>
                  {t.label} {!t.isActive && <span style={badge("grey")}>Hidden</span>}
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
                  {MODES.find((m) => m.value === t.mode)?.label} · {t.durationMinutes} min · {t.priceLabel}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button type="button" aria-label={`Move ${t.label} up`} disabled={i === 0} onClick={() => moveConsultType({ id: t.id, direction: "up" })} style={{ ...quietButton, opacity: i === 0 ? 0.3 : 1 }}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${t.label} down`}
                  disabled={i === types.length - 1}
                  onClick={() => moveConsultType({ id: t.id, direction: "down" })}
                  style={{ ...quietButton, opacity: i === types.length - 1 ? 0.3 : 1 }}
                >
                  ↓
                </button>
                <button type="button" onClick={() => setEditing(editing === t.id ? null : t.id)} style={smallButton}>
                  Edit
                </button>
              </div>
            </div>
            {editing === t.id && <ConsultTypeForm type={t} onDone={() => setEditing(null)} />}
          </div>
        ))}
      </div>
      {adding ? (
        <div style={card()}>
          <ConsultTypeForm key={types.length} type={blank} onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={smallButton}>
          + Add consultation type
        </button>
      )}
      <p style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 14 }}>
        Types that have been booked can be hidden but not deleted, so past bookings keep their details. Price changes apply to
        new bookings only. Paid consultations must cost at least ₱20.
      </p>
    </div>
  );
}
