import Link from "next/link";
import { card, colors, pageHeading } from "@/lib/booking/ui";
import { getAnalytics, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Analytics" };

const monthLink = { fontSize: 13.5, fontWeight: 600, color: colors.green, textDecoration: "none" } as const;

export default async function StaffAnalyticsPage({ searchParams }: PageProps<"/staff/analytics">) {
  const ctx = await getStaffContext();
  const { month } = await searchParams;
  const { period, cards, load, loadHeading } = await getAnalytics(ctx, typeof month === "string" ? month : undefined);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h2 style={pageHeading}>{ctx.isManager ? "Firm analytics" : "Your analytics"}</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <Link href={`/staff/analytics?month=${period.previous}`} style={monthLink}>
            ← Previous
          </Link>
          <span style={{ fontSize: 13.5, color: "oklch(0.45 0.01 258)" }}>{period.label}</span>
          <Link href={`/staff/analytics?month=${period.next}`} style={monthLink}>
            Next →
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 28 }}>
        {cards.map((c) => (
          <div key={c.label} style={card()} data-testid="stat-card">
            <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: colors.navy, fontFamily: "var(--font-lora), serif" }}>{c.value}</div>
            {c.hint && <div style={{ fontSize: 12, color: "oklch(0.6 0.01 258)", marginTop: 4 }}>{c.hint}</div>}
          </div>
        ))}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.4 0.01 258)", marginBottom: 12 }}>{loadHeading}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {load.map((l) => (
          <div key={l.name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 160, fontSize: 13.5, color: colors.ink }}>{l.name}</div>
            <div style={{ flex: 1, background: "oklch(0.94 0.005 90)", borderRadius: 6, height: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 6, background: colors.navy, width: `${l.barPct}%` }} />
            </div>
            <div style={{ width: 34, textAlign: "right", fontSize: 13, color: "oklch(0.5 0.01 258)" }}>{l.count}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 18 }}>
        Counts bookings that start in {period.label}, in Philippine time. Canceled bookings are left out of the
        consultation counts.
      </div>
    </div>
  );
}
