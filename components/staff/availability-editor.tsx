"use client";

import { useState, useTransition } from "react";
import { addTimeOff, removeTimeOff, saveWeeklyHours } from "@/lib/staff/actions";
import type { TimeOff, WeeklyHour } from "@/lib/staff/types";
import { card, colors, errorTextStyle, secondaryButton } from "@/lib/booking/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday first, as Philippine work weeks are usually read.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const input = { padding: "7px 10px", border: "1px solid oklch(0.85 0.005 90)", borderRadius: 7, fontSize: 14 } as const;
const small = { ...secondaryButton, fontSize: 13, padding: "6px 12px" } as const;
const quiet = { border: "none", background: "none", color: colors.green, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 } as const;

type Block = WeeklyHour & { key: number };
let nextKey = 0;
const withKeys = (hours: WeeklyHour[]): Block[] => hours.map((h) => ({ ...h, key: nextKey++ }));

export function WeeklyHoursEditor({ attorneyId, hours }: { attorneyId: string; hours: WeeklyHour[] }) {
  const [blocks, setBlocks] = useState<Block[]>(() => withKeys(hours));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const update = (key: number, patch: Partial<WeeklyHour>) => {
    setMessage(null);
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  };
  const add = (weekday: number) => {
    setMessage(null);
    setBlocks((bs) => [...bs, { weekday, startTime: "09:00", endTime: "17:00", key: nextKey++ }]);
  };
  const remove = (key: number) => {
    setMessage(null);
    setBlocks((bs) => bs.filter((b) => b.key !== key));
  };

  const save = () =>
    start(async () => {
      const result = await saveWeeklyHours({
        attorneyId,
        hours: blocks.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
      });
      setMessage(result.ok ? { ok: true, text: "Weekly hours saved." } : { ok: false, text: result.error });
    });

  return (
    <div style={card()}>
      {ORDER.map((day) => {
        const dayBlocks = blocks.filter((b) => b.weekday === day);
        return (
          <div
            key={day}
            data-testid={`hours-${DAYS[day]}`}
            style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, padding: "8px 0", borderTop: day === 1 ? "none" : "1px solid oklch(0.94 0.005 90)" }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, paddingTop: 6 }}>{DAYS[day]}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dayBlocks.length === 0 && <div style={{ fontSize: 13.5, color: "oklch(0.6 0.01 258)", paddingTop: 6 }}>Not available</div>}
              {dayBlocks.map((b) => (
                <div key={b.key} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="time" step={1800} aria-label={`${DAYS[day]} start`} value={b.startTime} onChange={(e) => update(b.key, { startTime: e.target.value })} style={input} />
                  <span style={{ fontSize: 13 }}>to</span>
                  <input type="time" step={1800} aria-label={`${DAYS[day]} end`} value={b.endTime} onChange={(e) => update(b.key, { endTime: e.target.value })} style={input} />
                  <button type="button" onClick={() => remove(b.key)} aria-label={`Remove ${DAYS[day]} block`} style={{ ...quiet, color: "oklch(0.55 0.01 258)" }}>
                    Remove
                  </button>
                </div>
              ))}
              <div>
                <button type="button" onClick={() => add(day)} style={quiet}>
                  + Add hours
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <button type="button" onClick={save} disabled={pending} style={{ ...secondaryButton, background: colors.navy, color: "#fff", border: "none" }}>
          {pending ? "Saving…" : "Save weekly hours"}
        </button>
        {message && (
          <span role={message.ok ? "status" : "alert"} style={message.ok ? { fontSize: 13, color: colors.green } : errorTextStyle}>
            {message.text}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 10 }}>
        Philippine time. Changes apply to new bookings only; existing bookings are kept.
      </div>
    </div>
  );
}

export function TimeOffEditor({ attorneyId, timeOff }: { attorneyId: string; timeOff: TimeOff[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const result = await addTimeOff({ attorneyId, fromDate, toDate: toDate || fromDate, reason });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setFromDate("");
      setToDate("");
      setReason("");
      setMessage({
        ok: true,
        text: result.overlapping
          ? `Time off added. ${result.overlapping} existing booking${result.overlapping === 1 ? " falls" : "s fall"} in this time and ${result.overlapping === 1 ? "was" : "were"} kept; reassign or cancel ${result.overlapping === 1 ? "it" : "them"} if needed.`
          : "Time off added.",
      });
    });

  return (
    <div style={card()}>
      {timeOff.length === 0 ? (
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", marginBottom: 12 }}>No upcoming time off.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {timeOff.map((t) => (
            <div key={t.id} data-testid="time-off" style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span>
                {t.label}
                {t.reason && <span style={{ color: "oklch(0.55 0.01 258)" }}> · {t.reason}</span>}
              </span>
              <button
                type="button"
                onClick={() => start(async () => void (await removeTimeOff({ attorneyId, timeOffId: t.id })))}
                style={{ ...quiet, color: "oklch(0.55 0.01 258)" }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        <label style={{ fontSize: 13 }}>
          From <input type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={input} />
        </label>
        <label style={{ fontSize: 13 }}>
          To <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} style={input} />
        </label>
        <input aria-label="Reason" placeholder="Reason (optional, staff only)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} style={{ ...input, flex: 1, minWidth: 160 }} />
        <button type="submit" disabled={pending} style={small}>
          {pending ? "Adding…" : "Add time off"}
        </button>
      </form>
      {message && (
        <div role={message.ok ? "status" : "alert"} style={{ ...(message.ok ? { fontSize: 13, color: colors.green } : errorTextStyle), marginTop: 10 }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
