import Link from "next/link";
import { colors, pageHeading } from "@/lib/booking/ui";
import { getCalendarWeek, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Calendar" };

const cellBorder = "1px solid oklch(0.92 0.005 90)";
const weekLink = { fontSize: 13.5, fontWeight: 600, color: colors.green, textDecoration: "none" } as const;

export default async function StaffCalendarPage({ searchParams }: PageProps<"/staff/calendar">) {
  const ctx = await getStaffContext();
  const { week } = await searchParams;
  const cal = await getCalendarWeek(ctx, typeof week === "string" ? week : undefined);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h2 style={pageHeading}>{ctx.isManager ? "Firm calendar" : "Your calendar"}</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <Link href={`/staff/calendar?week=${cal.previousWeek}`} style={weekLink}>
            ← Previous
          </Link>
          <span style={{ fontSize: 13.5, color: "oklch(0.45 0.01 258)" }}>{cal.rangeLabel}</span>
          <Link href={`/staff/calendar?week=${cal.nextWeek}`} style={weekLink}>
            Next →
          </Link>
          {cal.days[0].date !== cal.thisWeek && (
            <Link href="/staff/calendar" style={weekLink}>
              This week
            </Link>
          )}
        </div>
      </div>

      {cal.attorneys.length === 0 ? (
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>No attorneys to show.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px repeat(7, minmax(96px, 1fr))", minWidth: 820 }}>
            <div />
            {cal.days.map((d) => (
              <div
                key={d.date}
                style={{
                  textAlign: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 4px",
                  color: d.isToday ? colors.navy : "oklch(0.5 0.01 258)",
                  textDecoration: d.isToday ? "underline" : "none",
                }}
              >
                {d.dow} {d.day}
              </div>
            ))}
            {cal.attorneys.map((a) => (
              <div key={a.id} style={{ display: "contents" }}>
                <div style={{ padding: "12px 10px", fontSize: 13.5, fontWeight: 600, color: colors.navyDark, borderTop: cellBorder }}>
                  {a.name}
                  {!a.isActive && <div style={{ fontSize: 11.5, fontWeight: 400, color: "oklch(0.55 0.01 258)" }}>Inactive</div>}
                </div>
                {cal.days.map((d) => {
                  const list = cal.entries[`${a.id}|${d.date}`] ?? [];
                  return (
                    <div key={d.date} style={{ borderTop: cellBorder, padding: "8px 4px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {list.map((e) => (
                        <Link
                          key={e.id}
                          href={`/staff/appointments/${e.id}`}
                          title={`${e.consultLabel} with ${e.clientName}`}
                          data-testid="calendar-entry"
                          style={{
                            display: "block",
                            fontSize: 12,
                            lineHeight: 1.35,
                            padding: "5px 6px",
                            borderRadius: 6,
                            textDecoration: "none",
                            background: e.status === "confirmed" ? "oklch(0.95 0.02 150)" : "oklch(0.95 0.005 90)",
                            color: e.status === "no_show" ? "oklch(0.5 0.08 85)" : colors.ink,
                            borderLeft: `3px solid ${e.reviewStatus === "pending" && e.status === "confirmed" ? "oklch(0.72 0.1 85)" : "transparent"}`,
                          }}
                        >
                          <strong>{e.timeLabel}</strong> {e.clientName}
                          {e.status === "no_show" ? " (missed)" : ""}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 14 }}>
        Times are in Philippine time. A gold edge marks a booking still waiting for review.
      </div>
    </div>
  );
}
