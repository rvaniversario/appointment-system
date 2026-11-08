import { AddConflictParty, RemoveConflictParty } from "@/components/staff/conflict-controls";
import { card, pageHeading, secondaryButton } from "@/lib/booking/ui";
import { getStaffContext, searchConflicts } from "@/lib/staff/queries";

export const metadata = { title: "Conflict database" };

export default async function StaffConflictsPage({ searchParams }: PageProps<"/staff/conflicts">) {
  const ctx = await getStaffContext();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const parties = await searchConflicts(ctx, query);

  return (
    <div>
      <h2 style={pageHeading}>Conflict database</h2>
      <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", margin: "-8px 0 18px" }}>
        Every new booking is checked against these records automatically. Search tolerates misspellings.
      </p>

      <form method="get" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label="Search by name or matter"
          placeholder="Search by name or matter…"
          style={{ padding: "11px 14px", border: "1px solid oklch(0.85 0.005 90)", borderRadius: 7, fontSize: 14, width: "100%", maxWidth: 360 }}
        />
        <button type="submit" style={secondaryButton}>
          Search
        </button>
      </form>

      {ctx.isManager && (
        <div style={{ ...card("14px 16px"), marginBottom: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Add a party from a past or current matter</div>
          <AddConflictParty attorneys={ctx.attorneys.map((a) => ({ id: a.id, name: a.name }))} />
        </div>
      )}

      <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginBottom: 8 }}>
        {query ? `${parties.length} match${parties.length === 1 ? "" : "es"} for “${query}”` : "Most recently added"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {parties.map((c) => (
          <div
            key={c.id}
            data-testid="conflict-party"
            style={{ ...card("12px 16px"), borderRadius: 8, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
          >
            <span style={{ fontSize: 14 }}>
              {c.name} — {c.matter}
            </span>
            <span style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, color: "oklch(0.55 0.01 258)" }}>
              {c.attorneyName}
              {ctx.isManager && <RemoveConflictParty partyId={c.id} name={c.name} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
