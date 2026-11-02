"use client";

import Link from "next/link";
import { ATTORNEYS, CONFLICT_DB, getAttorney } from "@/lib/booking/data";
import type { AdminRole, AdminState, AdminTab, DayInfo } from "@/lib/booking/types";

interface AdminScreenProps {
  activeTab: AdminTab;
  admin: AdminState;
  days: DayInfo[];
  onConflictSearchChange: (v: string) => void;
  onLeadReassignChange: (id: number, val: string) => void;
  onReassignLead: (id: number) => void;
  onApproveLead: (id: number) => void;
}

const roleLabels: Record<AdminRole, string> = { attorney: "Attorney", partner: "Super admin" };
const tabsByRole: Record<AdminRole, AdminTab[]> = {
  attorney: ["calendar", "queue", "conflicts", "analytics"],
  partner: ["calendar", "queue", "conflicts", "analytics", "billing"],
};
const tabLabels: Record<AdminTab, string> = {
  calendar: "Firm calendar",
  queue: "Intake queue",
  conflicts: "Conflict database",
  analytics: "Analytics",
  billing: "Billing",
};

const DEMO_ATTORNEY_ID = "chen";
const LOAD_COUNTS: Record<string, number> = { chen: 24, okafor: 18, ramirez: 29, whitfield: 15, anand: 21, reilly: 35 };
const REVENUE_PER_CONSULT: Record<string, number> = { chen: 150, okafor: 350, ramirez: 150, whitfield: 350, anand: 150, reilly: 150 };
const MY_WEEKLY: Record<string, number[]> = {
  chen: [4, 6, 5, 7, 2],
  okafor: [3, 4, 2, 5, 4],
  ramirez: [6, 7, 5, 8, 3],
  whitfield: [2, 3, 4, 3, 3],
  anand: [4, 5, 3, 6, 3],
  reilly: [7, 8, 6, 9, 5],
};

export function AdminScreen({
  activeTab,
  admin,
  days,
  onConflictSearchChange,
  onLeadReassignChange,
  onReassignLead,
  onApproveLead,
}: AdminScreenProps) {
  const allowedTabs = tabsByRole[admin.role];

  const adminQueueItems = admin.queue.map((lead) => {
    const attorney = getAttorney(lead.attorneyId);
    const approved = lead.status === "approved";
    const backupOptions = ATTORNEYS.filter(
      (a) => a.id !== lead.attorneyId && a.practiceAreas.includes(lead.caseType)
    );
    return { ...lead, attorneyName: attorney ? attorney.name : "", approved, backupOptions };
  });

  const search = admin.conflictSearch.trim().toLowerCase();
  const adminConflictItems = CONFLICT_DB.filter(
    (c) => !search || c.name.toLowerCase().includes(search) || c.matter.toLowerCase().includes(search)
  ).map((c) => ({ ...c, attorneyName: getAttorney(c.attorneyId)?.name || "" }));

  let adminStatCards: { label: string; value: string }[];
  let adminLoadItems: { name: string; count: number; barPct: number }[];
  let adminLoadHeading: string;
  let adminBillingRows: { name: string; count: number; revenue: string }[] = [];

  if (admin.role === "attorney") {
    const myPending = adminQueueItems.filter(
      (q) => q.attorneyId === DEMO_ATTORNEY_ID && q.status === "pending"
    ).length;
    adminStatCards = [
      { label: "Your bookings this month", value: String(LOAD_COUNTS[DEMO_ATTORNEY_ID]) },
      {
        label: "Your revenue this month",
        value: "$" + (LOAD_COUNTS[DEMO_ATTORNEY_ID] * REVENUE_PER_CONSULT[DEMO_ATTORNEY_ID]).toLocaleString(),
      },
      { label: "Your no-show rate", value: "4%" },
      { label: "Pending intake requests", value: String(myPending) },
    ];
    const myWeek = MY_WEEKLY[DEMO_ATTORNEY_ID];
    const maxWeek = Math.max(...myWeek);
    adminLoadHeading = "Your consultation volume, last 5 weeks";
    adminLoadItems = myWeek.map((count, i) => ({
      name: `Week ${i + 1}`,
      count,
      barPct: Math.round((count / maxWeek) * 100),
    }));
  } else {
    const maxLoad = Math.max(...Object.values(LOAD_COUNTS));
    adminStatCards = [
      { label: "Bookings this month", value: "142" },
      { label: "No-show rate", value: "6%" },
      { label: "Lead-to-booking conversion", value: "58%" },
      { label: "Avg. time to first consult", value: "1.4 days" },
    ];
    adminLoadHeading = "Consultation load by attorney";
    adminLoadItems = ATTORNEYS.map((a) => ({
      name: a.name,
      count: LOAD_COUNTS[a.id],
      barPct: Math.round((LOAD_COUNTS[a.id] / maxLoad) * 100),
    }));
    adminBillingRows = ATTORNEYS.map((a) => ({
      name: a.name,
      count: LOAD_COUNTS[a.id],
      revenue: "$" + (LOAD_COUNTS[a.id] * REVENUE_PER_CONSULT[a.id]).toLocaleString(),
    }));
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 32px 80px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 20,
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 26,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              margin: "0 0 4px",
            }}
          >
            Staff Dashboard
          </h1>
          <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>
            Signed in as: {roleLabels[admin.role]}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 32 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {allowedTabs.map((key) => {
            const active = activeTab === key;
            return (
              <Link
                key={key}
                href={`/staff/${key}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: active ? "oklch(0.28 0.05 258)" : "transparent",
                  color: active ? "#fff" : "oklch(0.4 0.01 258)",
                  textDecoration: "none",
                }}
              >
                {tabLabels[key]}
              </Link>
            );
          })}
        </nav>
        <div style={{ minWidth: 0 }}>
          {activeTab === "calendar" && (
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7,1fr)", minWidth: 760 }}>
                <div />
                {days.map((d) => (
                  <div
                    key={d.label}
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "oklch(0.5 0.01 258)",
                      padding: "8px 4px",
                    }}
                  >
                    {d.dow} {d.day}
                  </div>
                ))}
                {ATTORNEYS.map((a) => (
                  <div key={a.id} style={{ display: "contents" }}>
                    <div
                      style={{
                        padding: "12px 10px",
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "oklch(0.25 0.01 258)",
                        borderTop: "1px solid oklch(0.92 0.005 90)",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {a.name}
                    </div>
                    {days.map((d, i) => {
                      const slots = (a.avail[i] || []).length;
                      return (
                        <div
                          key={i}
                          style={{
                            textAlign: "center",
                            padding: "12px 4px",
                            fontSize: 12.5,
                            borderTop: "1px solid oklch(0.92 0.005 90)",
                            color: slots === 0 ? "oklch(0.6 0.01 258)" : "oklch(0.4 0.07 150)",
                          }}
                        >
                          {slots === 0 ? "Full" : `${slots} open`}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "queue" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {adminQueueItems.map((lead) => (
                <div
                  key={lead.id}
                  style={{
                    background: "#fff",
                    border: "1px solid oklch(0.9 0.005 90)",
                    borderRadius: 12,
                    padding: "16px 20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 16,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
                        {lead.name}{" "}
                        {lead.urgency === "urgent" && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.55 0.16 25)" }}>
                            · Urgent
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
                        {lead.caseType} · matched to {lead.attorneyName}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 10px",
                        borderRadius: 20,
                        whiteSpace: "nowrap",
                        background: lead.approved ? "oklch(0.95 0.02 150)" : "oklch(0.97 0.02 85)",
                        color: lead.approved ? "oklch(0.4 0.07 150)" : "oklch(0.5 0.08 85)",
                      }}
                    >
                      {lead.approved ? "Approved" : "Pending review"}
                    </span>
                  </div>

                  {lead.conflict && (
                    <div
                      style={{
                        background: "oklch(0.97 0.03 25)",
                        border: "1px solid oklch(0.85 0.1 25)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 13.5,
                        color: "oklch(0.4 0.14 25)",
                        marginTop: 12,
                      }}
                    >
                      Conflict flagged — {lead.attorneyName} cannot take this matter. Reassign
                      below.
                    </div>
                  )}

                  {!lead.approved && (
                    <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
                      <select
                        value={lead.reassignTo}
                        onChange={(e) => onLeadReassignChange(lead.id, e.target.value)}
                        style={{
                          padding: "8px 10px",
                          border: "1px solid oklch(0.85 0.005 90)",
                          borderRadius: 7,
                          fontSize: 13.5,
                          background: "#fff",
                        }}
                      >
                        <option value="">Reassign to…</option>
                        {lead.backupOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onReassignLead(lead.id)}
                        disabled={!lead.reassignTo}
                        style={{
                          padding: "8px 14px",
                          border: "1px solid oklch(0.85 0.005 90)",
                          borderRadius: 7,
                          background: "#fff",
                          fontSize: 13.5,
                          fontWeight: 600,
                          cursor: lead.reassignTo ? "pointer" : "not-allowed",
                          color: lead.reassignTo ? "oklch(0.28 0.05 258)" : "oklch(0.7 0.01 258)",
                        }}
                      >
                        Reassign
                      </button>
                      <button
                        onClick={() => onApproveLead(lead.id)}
                        style={{
                          padding: "8px 14px",
                          border: "none",
                          borderRadius: 7,
                          background: "oklch(0.5 0.08 150)",
                          color: "#fff",
                          fontSize: 13.5,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Approve match
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "conflicts" && (
            <>
              <input
                type="text"
                value={admin.conflictSearch}
                onChange={(e) => onConflictSearchChange(e.target.value)}
                placeholder="Search by name or matter…"
                style={{
                  padding: "11px 14px",
                  border: "1px solid oklch(0.85 0.005 90)",
                  borderRadius: 7,
                  fontSize: 14,
                  width: "100%",
                  maxWidth: 360,
                  boxSizing: "border-box",
                  marginBottom: 18,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {adminConflictItems.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      background: "#fff",
                      border: "1px solid oklch(0.9 0.005 90)",
                      borderRadius: 8,
                      padding: "12px 16px",
                    }}
                  >
                    <span style={{ fontSize: 14, color: "oklch(0.32 0.01 258)" }}>
                      {c.name} — {c.matter}
                    </span>
                    <span style={{ fontSize: 13, color: "oklch(0.55 0.01 258)" }}>{c.attorneyName}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "analytics" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 16,
                  marginBottom: 28,
                }}
              >
                {adminStatCards.map((card) => (
                  <div
                    key={card.label}
                    style={{
                      background: "#fff",
                      border: "1px solid oklch(0.9 0.005 90)",
                      borderRadius: 12,
                      padding: "18px 20px",
                    }}
                  >
                    <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginBottom: 6 }}>
                      {card.label}
                    </div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        color: "oklch(0.28 0.05 258)",
                        fontFamily: "var(--font-lora), serif",
                      }}
                    >
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 12 }}>
                {adminLoadHeading}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {adminLoadItems.map((l) => (
                  <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 140, fontSize: 13.5, color: "oklch(0.32 0.01 258)" }}>{l.name}</div>
                    <div
                      style={{
                        flex: 1,
                        background: "oklch(0.94 0.005 90)",
                        borderRadius: 6,
                        height: 10,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 6,
                          background: "oklch(0.28 0.05 258)",
                          width: `${l.barPct}%`,
                        }}
                      />
                    </div>
                    <div style={{ width: 34, textAlign: "right", fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
                      {l.count}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "billing" && (
            <div
              style={{
                background: "#fff",
                border: "1px solid oklch(0.9 0.005 90)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr",
                  gap: 16,
                  padding: "14px 20px",
                  background: "oklch(0.97 0.005 90)",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "oklch(0.5 0.01 258)",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                <div>Attorney</div>
                <div>Consults this month</div>
                <div>Revenue</div>
              </div>
              {adminBillingRows.map((r) => (
                <div
                  key={r.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    gap: 16,
                    padding: "14px 20px",
                    borderTop: "1px solid oklch(0.94 0.005 90)",
                    fontSize: 14,
                    color: "oklch(0.32 0.01 258)",
                    alignItems: "center",
                  }}
                >
                  <div>{r.name}</div>
                  <div>{r.count}</div>
                  <div style={{ fontWeight: 600, color: "oklch(0.28 0.05 258)" }}>{r.revenue}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
