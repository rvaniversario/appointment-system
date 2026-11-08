"use client";

import { useState, useTransition } from "react";
import { cancelAppointment } from "@/lib/portal/actions";
import type { PortalAppointment } from "@/lib/portal/types";
import { badge, card, colors, errorTextStyle, pageHeading, secondaryButton } from "@/lib/booking/ui";
import { RescheduleForm } from "./reschedule-form";

const STATUS: Record<string, { label: string; tone: Parameters<typeof badge>[0] }> = {
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "grey" },
  canceled: { label: "Canceled", tone: "red" },
  no_show: { label: "Missed", tone: "amber" },
};

const MODE: Record<string, string> = { video: "Video call", phone: "Phone call", in_person: "In person" };

function AppointmentCard({ appt }: { appt: PortalAppointment }) {
  const [panel, setPanel] = useState<"none" | "reschedule" | "cancel">("none");
  const [error, setError] = useState<string | null>(null);
  const [canceling, startCancel] = useTransition();
  const status = appt.upcoming ? STATUS.confirmed : (STATUS[appt.status] ?? { label: "Past", tone: "grey" as const });
  const pastConfirmed = !appt.upcoming && appt.status === "confirmed";

  const cancel = () =>
    startCancel(async () => {
      const result = await cancelAppointment({ appointmentId: appt.id });
      if (!result.ok) setError(result.error);
      else setPanel("none");
    });

  return (
    <div style={card()} data-testid="portal-appointment">
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", color: "oklch(0.55 0.01 258)", marginBottom: 4 }}>
        {appt.firmName}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: colors.navyDark }}>{appt.consultLabel}</div>
          <div style={{ fontSize: 13.5, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
            with {appt.attorneyName} · {appt.whenLabel} · {appt.durationMinutes} min · {MODE[appt.mode]}
          </div>
        </div>
        <span style={badge(status.tone)}>{pastConfirmed ? "Past" : status.label}</span>
      </div>

      {appt.upcoming && appt.meetingUrl && (
        <div style={{ fontSize: 13.5, marginTop: 10 }}>
          <a href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.green, fontWeight: 600 }}>
            Join the video call
          </a>
        </div>
      )}
      {appt.upcoming && appt.officeAddress && (
        <div style={{ fontSize: 13.5, color: "oklch(0.45 0.01 258)", marginTop: 10 }}>Where: {appt.officeAddress}</div>
      )}

      {appt.upcoming && !appt.canChange && (
        <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)", marginTop: 12 }}>
          Online changes close {appt.cutoffHours} hour{appt.cutoffHours === 1 ? "" : "s"} before the appointment. To change
          it now, please contact {appt.firmName}.
        </div>
      )}

      {appt.canChange && panel === "none" && (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={() => setPanel("reschedule")} style={{ ...secondaryButton, fontSize: 13.5, padding: "8px 14px" }}>
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPanel("cancel");
            }}
            style={{ ...secondaryButton, fontSize: 13.5, padding: "8px 14px", color: colors.errorText }}
          >
            Cancel
          </button>
        </div>
      )}

      {panel === "reschedule" && <RescheduleForm appointmentId={appt.id} onClose={() => setPanel("none")} />}

      {panel === "cancel" && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid oklch(0.92 0.005 90)" }}>
          <div style={{ fontSize: 14, color: colors.ink, marginBottom: 12 }}>
            Cancel this appointment?
            {appt.paid && ` Your payment will be flagged to ${appt.firmName} for a refund.`}
          </div>
          {error && (
            <div role="alert" style={{ ...errorTextStyle, marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setPanel("none")} style={{ ...secondaryButton, fontSize: 13.5, fontWeight: 400 }}>
              Keep appointment
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={canceling}
              style={{
                padding: "9px 14px",
                border: "none",
                borderRadius: 7,
                fontSize: 13.5,
                fontWeight: 600,
                background: colors.errorText,
                color: "#fff",
                cursor: canceling ? "wait" : "pointer",
              }}
            >
              {canceling ? "Canceling…" : "Yes, cancel it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppointmentsView({ appointments }: { appointments: PortalAppointment[] }) {
  const upcoming = appointments.filter((a) => a.upcoming);
  const past = appointments.filter((a) => !a.upcoming).reverse();

  return (
    <div>
      <h2 style={pageHeading}>Upcoming appointments</h2>
      {upcoming.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>
          You have no upcoming appointments. Book through your law firm&apos;s booking page.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ ...pageHeading, fontSize: 18, margin: "36px 0 14px" }}>Past and canceled</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {past.map((a) => (
              <AppointmentCard key={a.id} appt={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
