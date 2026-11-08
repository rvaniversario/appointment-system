import Link from "next/link";
import { TimeOffEditor, WeeklyHoursEditor } from "@/components/staff/availability-editor";
import { colors, pageHeading } from "@/lib/booking/ui";
import { editableAttorneys, getSchedule, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Availability" };

export default async function StaffAvailabilityPage({ searchParams }: PageProps<"/staff/availability">) {
  const ctx = await getStaffContext();
  const { attorney } = await searchParams;
  const choices = editableAttorneys(ctx);
  const selected = choices.find((a) => a.id === attorney) ?? choices.find((a) => a.id === ctx.attorneyId) ?? choices[0];

  if (!selected) {
    return (
      <div>
        <h2 style={pageHeading}>Availability</h2>
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>There are no attorney schedules for you to manage.</div>
      </div>
    );
  }
  const schedule = await getSchedule(selected.id);

  return (
    <div>
      <h2 style={pageHeading}>{selected.id === ctx.attorneyId ? "Your availability" : `Availability: ${selected.name}`}</h2>
      {choices.length > 1 && (
        <nav aria-label="Attorneys" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {choices.map((a) => {
            const active = a.id === selected.id;
            return (
              <Link
                key={a.id}
                href={`/staff/availability?attorney=${a.id}`}
                aria-current={active ? "page" : undefined}
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  background: active ? colors.navy : "#fff",
                  color: active ? "#fff" : "oklch(0.4 0.01 258)",
                  border: `1px solid ${active ? colors.navy : "oklch(0.88 0.005 90)"}`,
                }}
              >
                {a.name}
              </Link>
            );
          })}
        </nav>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px" }}>Weekly hours</h3>
      <WeeklyHoursEditor key={selected.id} attorneyId={selected.id} hours={schedule.hours} />

      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "28px 0 10px" }}>Time off</h3>
      <TimeOffEditor key={`off-${selected.id}`} attorneyId={selected.id} timeOff={schedule.timeOff} />
    </div>
  );
}
