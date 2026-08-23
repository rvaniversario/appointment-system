"use client";

import { CONSULT_TYPES, TIME_SLOTS } from "@/lib/booking/data";
import type { Attorney, BookingSelection, DayInfo } from "@/lib/booking/types";
import { primaryButtonDisabled } from "@/lib/booking/ui";

interface BookTimeScreenProps {
  attorney: Attorney;
  booking: BookingSelection;
  days: DayInfo[];
  onSetConsultType: (id: string) => void;
  onSetDate: (i: number) => void;
  onSetTime: (t: string) => void;
  onContinue: () => void;
}

export function BookTimeScreen({
  attorney,
  booking,
  days,
  onSetConsultType,
  onSetDate,
  onSetTime,
  onContinue,
}: BookTimeScreenProps) {
  const avail = attorney.avail || [];
  const dateIndex = booking.dateIndex;
  const daySlots = dateIndex != null ? avail[dateIndex] || [] : [];
  const incomplete = !booking.consultType || dateIndex == null || !booking.time;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 32px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        Choose a consultation type &amp; time
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 28px" }}>
        Booking with {attorney.name} · times shown in your local time zone
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {CONSULT_TYPES.map((ct) => {
          const sel = booking.consultType === ct.id;
          return (
            <div
              key={ct.id}
              onClick={() => onSetConsultType(ct.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 10,
                cursor: "pointer",
                background: "#fff",
                border: `2px solid ${sel ? "oklch(0.72 0.1 85)" : "oklch(0.9 0.005 90)"}`,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.75 0.005 90)"}`,
                  background: sel
                    ? "radial-gradient(oklch(0.28 0.05 258) 40%, transparent 44%)"
                    : "transparent",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
                  {ct.label}
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
                  {ct.sub}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.28 0.05 258)" }}>
                {ct.price}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 10 }}>
        Select a date
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, marginBottom: 24 }}>
        {days.map((d, i) => {
          const sel = dateIndex === i;
          const hasSlots = (avail[i] || []).length > 0;
          return (
            <div
              key={i}
              onClick={() => onSetDate(i)}
              style={{
                minWidth: 52,
                padding: "8px 6px",
                borderRadius: 8,
                textAlign: "center",
                cursor: "pointer",
                background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                color: sel
                  ? "#fff"
                  : hasSlots
                  ? "oklch(0.32 0.01 258)"
                  : "oklch(0.75 0.005 90)",
                border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
              }}
            >
              <div style={{ fontSize: 11.5, opacity: 0.8 }}>{d.dow}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{d.day}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 10 }}>
        Available times
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
        {TIME_SLOTS.map((t, i) => {
          const available = dateIndex != null && daySlots.includes(i);
          const sel = booking.time === t;
          return (
            <button
              key={t}
              disabled={!available}
              onClick={available ? () => onSetTime(t) : undefined}
              style={{
                padding: "11px 0",
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 600,
                cursor: available ? "pointer" : "not-allowed",
                background: sel ? "oklch(0.28 0.05 258)" : available ? "#fff" : "oklch(0.95 0.005 90)",
                color: sel ? "#fff" : available ? "oklch(0.32 0.01 258)" : "oklch(0.75 0.005 90)",
                border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      {dateIndex != null && daySlots.length === 0 && (
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", padding: "16px 0" }}>
          No open times on this day — try another date above.
        </div>
      )}

      <button disabled={incomplete} onClick={onContinue} style={primaryButtonDisabled(incomplete)}>
        Continue to intake form →
      </button>
    </div>
  );
}
