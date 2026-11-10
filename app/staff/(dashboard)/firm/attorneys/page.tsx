import Link from "next/link";
import { badge, card, colors, pageHeading } from "@/lib/booking/ui";
import { getFirmAttorneys, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Attorneys" };

export default async function FirmAttorneysPage() {
  const ctx = await requireManagerContext();
  const attorneys = await getFirmAttorneys(ctx);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={pageHeading}>Attorneys</h2>
        <Link href="/staff/firm/attorneys/new" style={{ fontSize: 14, fontWeight: 600, color: colors.green, textDecoration: "none" }}>
          + Add attorney
        </Link>
      </div>
      {attorneys.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>No attorneys yet. Add one to open your booking page.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {attorneys.map((a) => (
            <Link
              key={a.id}
              href={`/staff/firm/attorneys/${a.id}`}
              data-testid="attorney-row"
              style={{ ...card("14px 18px"), display: "flex", justifyContent: "space-between", gap: 12, textDecoration: "none", color: colors.ink }}
            >
              <span>
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.navyDark }}>{a.fullName}</span>
                <span style={{ display: "block", fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
                  {a.practiceAreas.join(", ") || "No practice areas"} · {a.memberName ? `Signs in as ${a.memberName}` : "No staff account linked"}
                </span>
              </span>
              <span style={badge(!a.isActive ? "grey" : a.checked ? "green" : "amber")}>
                {!a.isActive ? "Hidden" : a.checked ? "Listed" : a.ibpRollNo && a.admittedYear ? "Waiting for our check" : "Needs roll number"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
