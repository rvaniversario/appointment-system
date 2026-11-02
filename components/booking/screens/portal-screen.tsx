"use client";

import { TIME_SLOTS, getAttorney } from "@/lib/booking/data";
import type { DayInfo, PortalState, PortalTab } from "@/lib/booking/types";
import { linkButton } from "@/lib/booking/ui";

interface PortalScreenProps {
  activeTab: PortalTab;
  portal: PortalState;
  days: DayInfo[];
  messagingAttorneyName: string;
  onGoHome: () => void;
  onReschedule: (id: number) => void;
  onCancel: (id: number) => void;
  onCancelRescheduleUI: () => void;
  onSetRescheduleDate: (i: number) => void;
  onSetRescheduleTime: (t: string) => void;
  onConfirmReschedule: (id: number) => void;
  onMessageDraftChange: (v: string) => void;
  onSendMessage: () => void;
  onAddDocument: () => void;
}

export function PortalScreen({
  activeTab,
  portal,
  days,
  messagingAttorneyName,
  onGoHome,
  onReschedule,
  onCancel,
  onCancelRescheduleUI,
  onSetRescheduleDate,
  onSetRescheduleTime,
  onConfirmReschedule,
  onMessageDraftChange,
  onSendMessage,
  onAddDocument,
}: PortalScreenProps) {
  const rescheduleIncomplete = portal.rescheduleDateIndex == null || !portal.rescheduleTime;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 32px 80px" }}>
      <button onClick={onGoHome} style={{ ...linkButton, marginBottom: 18 }}>
        ← Back
      </button>

      {activeTab === "appointments" && (
        <div>
          <h2
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 22,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              margin: "0 0 18px",
            }}
          >
            Upcoming appointments
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {portal.appointments.map((appt) => {
              const attorney = getAttorney(appt.attorneyId);
              const canceled = appt.status === "canceled";
              const isRescheduling = portal.rescheduleId === appt.id;
              return (
                <div
                  key={appt.id}
                  style={{
                    background: "#fff",
                    border: "1px solid oklch(0.9 0.005 90)",
                    borderRadius: 12,
                    padding: "18px 20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
                        {appt.type}
                      </div>
                      <div style={{ fontSize: 13.5, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
                        with {attorney ? attorney.name : ""} · {appt.dateLabel} at {appt.time}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        background: canceled ? "oklch(0.95 0.03 25)" : "oklch(0.95 0.02 150)",
                        color: canceled ? "oklch(0.5 0.14 25)" : "oklch(0.4 0.07 150)",
                      }}
                    >
                      {canceled ? "Canceled" : "Upcoming"}
                    </span>
                  </div>

                  {!canceled && !isRescheduling && (
                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button
                        onClick={() => onReschedule(appt.id)}
                        style={{
                          padding: "8px 14px",
                          border: "1px solid oklch(0.85 0.005 90)",
                          borderRadius: 7,
                          background: "#fff",
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "oklch(0.28 0.05 258)",
                          cursor: "pointer",
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => onCancel(appt.id)}
                        style={{
                          padding: "8px 14px",
                          border: "1px solid oklch(0.85 0.005 90)",
                          borderRadius: 7,
                          background: "#fff",
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: "oklch(0.55 0.16 25)",
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {isRescheduling && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid oklch(0.92 0.005 90)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "oklch(0.4 0.01 258)",
                          marginBottom: 8,
                        }}
                      >
                        Pick a new date
                      </div>
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14 }}>
                        {days.map((d, i) => {
                          const sel = portal.rescheduleDateIndex === i;
                          return (
                            <div
                              key={i}
                              onClick={() => onSetRescheduleDate(i)}
                              style={{
                                minWidth: 48,
                                padding: "7px 4px",
                                borderRadius: 8,
                                textAlign: "center",
                                cursor: "pointer",
                                background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                                color: sel ? "#fff" : "oklch(0.32 0.01 258)",
                                border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
                              }}
                            >
                              <div style={{ fontSize: 11, opacity: 0.8 }}>{d.dow}</div>
                              <div style={{ fontSize: 15, fontWeight: 700 }}>{d.day}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "oklch(0.4 0.01 258)",
                          marginBottom: 8,
                        }}
                      >
                        Pick a new time
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3,1fr)",
                          gap: 8,
                          marginBottom: 16,
                        }}
                      >
                        {TIME_SLOTS.map((t) => {
                          const sel = portal.rescheduleTime === t;
                          return (
                            <button
                              key={t}
                              onClick={() => onSetRescheduleTime(t)}
                              style={{
                                padding: "9px 0",
                                borderRadius: 7,
                                fontSize: 13.5,
                                fontWeight: 600,
                                cursor: "pointer",
                                background: sel ? "oklch(0.28 0.05 258)" : "#fff",
                                color: sel ? "#fff" : "oklch(0.32 0.01 258)",
                                border: `1px solid ${sel ? "oklch(0.28 0.05 258)" : "oklch(0.9 0.005 90)"}`,
                              }}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={onCancelRescheduleUI}
                          style={{
                            padding: "9px 14px",
                            border: "1px solid oklch(0.85 0.005 90)",
                            borderRadius: 7,
                            background: "#fff",
                            fontSize: 13.5,
                            color: "oklch(0.4 0.01 258)",
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => onConfirmReschedule(appt.id)}
                          disabled={rescheduleIncomplete}
                          style={{
                            padding: "9px 14px",
                            border: "none",
                            borderRadius: 7,
                            fontSize: 13.5,
                            fontWeight: 600,
                            cursor: rescheduleIncomplete ? "not-allowed" : "pointer",
                            background: rescheduleIncomplete ? "oklch(0.9 0.005 90)" : "oklch(0.28 0.05 258)",
                            color: rescheduleIncomplete ? "oklch(0.6 0.01 258)" : "#fff",
                          }}
                        >
                          Confirm new time
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "messages" && (
        <div>
          <h2
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 22,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              margin: "0 0 18px",
            }}
          >
            Messages with {messagingAttorneyName}
          </h2>
          <div
            style={{
              background: "#fff",
              border: "1px solid oklch(0.9 0.005 90)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginBottom: 16,
              minHeight: 200,
            }}
          >
            {portal.messages.map((m, i) => {
              const mine = m.from === "client";
              return (
                <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      fontSize: 14,
                      lineHeight: 1.5,
                      background: mine ? "oklch(0.28 0.05 258)" : "oklch(0.95 0.005 90)",
                      color: mine ? "#fff" : "oklch(0.32 0.01 258)",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={portal.messageDraft}
              onChange={(e) => onMessageDraftChange(e.target.value)}
              placeholder="Type a message…"
              style={{
                flex: 1,
                padding: "11px 14px",
                border: "1px solid oklch(0.85 0.005 90)",
                borderRadius: 7,
                fontSize: 14,
              }}
            />
            <button
              onClick={onSendMessage}
              style={{
                padding: "11px 18px",
                border: "none",
                borderRadius: 7,
                background: "oklch(0.28 0.05 258)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div>
          <h2
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 22,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              margin: "0 0 18px",
            }}
          >
            Documents
          </h2>
          <button
            onClick={onAddDocument}
            style={{
              padding: "10px 16px",
              border: "1px solid oklch(0.85 0.005 90)",
              borderRadius: 7,
              background: "#fff",
              fontSize: 14,
              fontWeight: 600,
              color: "oklch(0.28 0.05 258)",
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            + Upload document
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {portal.documents.map((doc, idx) => (
              <div
                key={`${doc.name}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#fff",
                  border: "1px solid oklch(0.9 0.005 90)",
                  borderRadius: 8,
                  padding: "12px 16px",
                }}
              >
                <span style={{ fontSize: 14, color: "oklch(0.32 0.01 258)" }}>{doc.name}</span>
                <button
                  style={{
                    border: "none",
                    background: "none",
                    color: "oklch(0.5 0.08 150)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
