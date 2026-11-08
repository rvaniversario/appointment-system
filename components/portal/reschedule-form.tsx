"use client";

import { useEffect, useState, useTransition } from "react";
import type { SlotPageData } from "@/lib/booking/queries";
import { loadRescheduleSlots, rescheduleAppointment } from "@/lib/portal/actions";
import { addDays } from "@/lib/booking/time";
import { colors, errorTextStyle, secondaryButton } from "@/lib/booking/ui";

const sectionLabel = { fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 8 } as const;

function choiceStyle(selected: boolean, disabled = false) {
  return {
    borderRadius: 8,
    textAlign: "center" as const,
    cursor: disabled ? "not-allowed" : "pointer",
    background: selected ? colors.navy : "#fff",
    color: selected ? "#fff" : disabled ? "oklch(0.7 0.01 258)" : "oklch(0.32 0.01 258)",
    border: `1px solid ${selected ? colors.navy : "oklch(0.9 0.005 90)"}`,
  };
}

/** Picks a new time with the same attorney. Times come from the server, in Manila time. */
export function RescheduleForm({ appointmentId, onClose }: { appointmentId: string; onClose: () => void }) {
  const [page, setPage] = useState<SlotPageData | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = (fromDate?: string) =>
    startLoading(async () => {
      const result = await loadRescheduleSlots({ appointmentId, fromDate });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setPage(result);
      const firstOpen = result.days.find((d) => d.slots.length > 0);
      setDate(firstOpen?.date ?? null);
      setStartsAt(null);
    });

  // Load the first week once, when the form opens.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  const day = page?.days.find((d) => d.date === date);
  const lastDay = page?.days[page.days.length - 1];

  const confirm = () => {
    if (!startsAt) return;
    startSaving(async () => {
      const result = await rescheduleAppointment({ appointmentId, startsAt });
      if (!result.ok) {
        setError(result.error);
        load(page?.fromDate);
        return;
      }
      onClose();
    });
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid oklch(0.92 0.005 90)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={sectionLabel}>Pick a new date</div>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            disabled={!page?.canGoBack || loading}
            onClick={() => page && load(addDays(page.fromDate, -7))}
            style={{ ...linkStyle, opacity: page?.canGoBack ? 1 : 0.4 }}
          >
            ← Earlier
          </button>
          <button
            type="button"
            disabled={!page?.canGoForward || loading}
            onClick={() => lastDay && load(addDays(lastDay.date, 1))}
            style={{ ...linkStyle, opacity: page?.canGoForward ? 1 : 0.4 }}
          >
            Later →
          </button>
        </div>
      </div>

      {!page && loading && <div style={{ fontSize: 13.5, color: "oklch(0.55 0.01 258)", padding: "10px 0" }}>Loading open times…</div>}

      {page && (
        <>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, opacity: loading ? 0.6 : 1 }}>
            {page.days.map((d) => {
              const open = d.slots.length;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={!open}
                  aria-pressed={d.date === date}
                  aria-label={`${d.label}, ${open ? `${open} open time${open === 1 ? "" : "s"}` : "no open times"}`}
                  onClick={() => {
                    setDate(d.date);
                    setStartsAt(null);
                  }}
                  style={{ ...choiceStyle(d.date === date, !open), minWidth: 52, padding: "7px 4px" }}
                >
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{d.dow}</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{d.day}</div>
                </button>
              );
            })}
          </div>

          <div style={sectionLabel}>Pick a new time (Philippine time)</div>
          {day && day.slots.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
              {day.slots.map((s) => (
                <button
                  key={s.startsAt}
                  type="button"
                  aria-pressed={s.startsAt === startsAt}
                  onClick={() => setStartsAt(s.startsAt)}
                  style={{ ...choiceStyle(s.startsAt === startsAt), padding: "9px 0", fontSize: 13.5, fontWeight: 600 }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: "oklch(0.55 0.01 258)", marginBottom: 16 }}>
              No open times this week. Try later dates.
            </div>
          )}
        </>
      )}

      {error && (
        <div role="alert" style={{ ...errorTextStyle, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onClose} style={{ ...secondaryButton, fontWeight: 400, color: "oklch(0.4 0.01 258)" }}>
          Keep current time
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!startsAt || saving}
          style={{
            padding: "9px 14px",
            border: "none",
            borderRadius: 7,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: !startsAt || saving ? "not-allowed" : "pointer",
            background: !startsAt ? "oklch(0.9 0.005 90)" : colors.navy,
            color: !startsAt ? "oklch(0.6 0.01 258)" : "#fff",
          }}
        >
          {saving ? "Saving…" : "Confirm new time"}
        </button>
      </div>
    </div>
  );
}

const linkStyle = { border: "none", background: "none", color: colors.green, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };

