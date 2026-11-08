"use client";

import type { ConsultTypeOption } from "@/lib/booking/public-types";
import type { BookingSelection } from "@/lib/booking/types";
import type { SlotPage } from "@/components/booking/wizard/wizard-context";
import { primaryButtonDisabled, secondaryButton } from "@/lib/booking/ui";

interface BookTimeScreenProps {
  attorneyName: string;
  consultTypes: ConsultTypeOption[];
  booking: BookingSelection;
  slots: SlotPage;
  notice: string | null;
  pending: boolean;
  onSetConsultType: (id: string) => void;
  onShowWeek: (direction: "back" | "forward") => void;
  onSetDate: (date: string) => void;
  onSetTime: (startsAt: string, label: string) => void;
  onContinue: () => void;
}

const sectionLabel = { fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 10 } as const;

export function BookTimeScreen({
  attorneyName,
  consultTypes,
  booking,
  slots,
  notice,
  pending,
  onSetConsultType,
  onShowWeek,
  onSetDate,
  onSetTime,
  onContinue,
}: BookTimeScreenProps) {
  const day = slots.days.find((d) => d.date === booking.date);
  const incomplete = !booking.consultTypeId || !booking.startsAt;

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
        Booking with {attorneyName} · times shown in Philippine time (PHT)
      </p>

      {notice && (
        <div
          role="alert"
          style={{
            background: "oklch(0.97 0.03 25)",
            border: "1px solid oklch(0.85 0.1 25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 14,
            color: "oklch(0.4 0.14 25)",
            marginBottom: 20,
          }}
        >
          {notice}
        </div>
      )}

      {consultTypes.length === 0 && (
        <div style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", padding: "16px 0" }}>
          This firm isn&apos;t offering online consultations right now.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {consultTypes.map((ct) => {
          const sel = booking.consultTypeId === ct.id;
          return (
            <button
              key={ct.id}
              type="button"
              aria-pressed={sel}
              onClick={() => onSetConsultType(ct.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                borderRadius: 10,
                cursor: "pointer",
                background: "#fff",
                textAlign: "left",
                font: "inherit",
                border: `2px solid ${sel ? "oklch(0.72 0.1 85)" : "oklch(0.9 0.005 90)"}`,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: "50%",
                  border: `2px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.75 0.005 90)"}`,
                  background: sel ? "radial-gradient(oklch(0.28 0.05 258) 40%, transparent 44%)" : "transparent",
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>{ct.label}</div>
                <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
                  {[ct.description, `${ct.durationMinutes} minutes`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.28 0.05 258)" }}>{ct.priceLabel}</div>
            </button>
          );
        })}
      </div>

      {booking.consultTypeId && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ ...sectionLabel, marginBottom: 0 }}>Select a date</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => onShowWeek("back")}
                disabled={!slots.canGoBack || slots.loading}
                style={{ ...secondaryButton, padding: "6px 10px", opacity: slots.canGoBack ? 1 : 0.4 }}
              >
                ← Earlier
              </button>
              <button
                type="button"
                onClick={() => onShowWeek("forward")}
                disabled={!slots.canGoForward || slots.loading}
                style={{ ...secondaryButton, padding: "6px 10px", opacity: slots.canGoForward ? 1 : 0.4 }}
              >
                Later →
              </button>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 6,
              marginBottom: 24,
              opacity: slots.loading ? 0.5 : 1,
            }}
          >
            {slots.days.map((d) => {
              const sel = booking.date === d.date;
              const hasSlots = d.slots.length > 0;
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${d.label}${hasSlots ? "" : ", no open times"}`}
                  onClick={() => onSetDate(d.date)}
                  style={{
                    minWidth: 52,
                    padding: "8px 6px",
                    borderRadius: 8,
                    textAlign: "center",
                    cursor: "pointer",
                    font: "inherit",
                    background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                    color: sel ? "#fff" : hasSlots ? "oklch(0.32 0.01 258)" : "oklch(0.75 0.005 90)",
                    border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
                  }}
                >
                  <div style={{ fontSize: 11.5, opacity: 0.8 }}>{d.dow}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{d.day}</div>
                </button>
              );
            })}
          </div>

          <div style={sectionLabel}>Available times</div>
          {!booking.date && !slots.loading && (
            <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", padding: "4px 0 16px" }}>
              {slots.days.some((d) => d.slots.length)
                ? "Pick a date to see open times."
                : "No open times this week. Try later dates."}
            </div>
          )}
          {day && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
              {day.slots.map((slot) => {
                const sel = booking.startsAt === slot.startsAt;
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => onSetTime(slot.startsAt, slot.label)}
                    style={{
                      padding: "11px 0",
                      borderRadius: 7,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                      color: sel ? "#fff" : "oklch(0.32 0.01 258)",
                      border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
                    }}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          )}
          {day && day.slots.length === 0 && (
            <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", padding: "16px 0" }}>
              No open times on this day — try another date above.
            </div>
          )}
        </>
      )}

      <button disabled={incomplete || pending} onClick={onContinue} style={primaryButtonDisabled(incomplete || pending)}>
        {pending ? "Reserving your time…" : "Continue to intake form →"}
      </button>
    </div>
  );
}
