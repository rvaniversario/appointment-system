import Link from "next/link";
import { listAdminFirms, type FirmStage } from "@/lib/admin/queries";
import { requireOperator } from "@/lib/admin/auth";
import { badge, card, colors, pageHeading } from "@/lib/booking/ui";
import { formatCalendarDate } from "@/lib/booking/time";

export const metadata = { title: "Firms" };

const STAGE: Record<FirmStage, { label: string; tone: "green" | "red" | "amber" | "grey" }> = {
  review: { label: "Waiting for review", tone: "amber" },
  setup: { label: "Setting up", tone: "grey" },
  live: { label: "Live", tone: "green" },
  suspended: { label: "Suspended", tone: "red" },
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "review", label: "Waiting for review" },
  { key: "check", label: "Attorneys to check" },
  { key: "live", label: "Live" },
  { key: "setup", label: "Setting up" },
  { key: "suspended", label: "Suspended" },
] as const;

export default async function OperatorFirmsPage({ searchParams }: PageProps<"/admin/firms">) {
  await requireOperator();
  const { show } = await searchParams;
  const filter = typeof show === "string" ? show : "";
  const firms = await listAdminFirms();
  const waiting = firms.filter((f) => f.stage === "review").length;
  const toCheck = firms.filter((f) => f.stage === "live" && f.toCheck > 0).length;
  const shown = firms.filter((f) => (filter === "check" ? f.toCheck > 0 && f.stage === "live" : !filter || f.stage === filter));

  return (
    <div>
      <h1 style={pageHeading}>Firms</h1>
      <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", margin: "0 0 16px" }} id="firm-summary">
        {waiting} waiting for review · {toCheck} live {toCheck === 1 ? "firm has" : "firms have"} attorneys to check
      </p>
      <nav aria-label="Filter firms" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/firms?show=${f.key}` : "/admin/firms"}
            aria-current={filter === f.key ? "page" : undefined}
            style={{
              fontSize: 13,
              padding: "6px 12px",
              borderRadius: 20,
              textDecoration: "none",
              border: "1px solid oklch(0.85 0.005 90)",
              background: filter === f.key ? colors.navy : "#fff",
              color: filter === f.key ? "#fff" : colors.ink,
            }}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>No firms here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((f) => (
            <Link
              key={f.id}
              href={`/admin/firms/${f.id}`}
              data-testid="admin-firm-row"
              data-slug={f.slug}
              style={{ ...card("14px 18px"), display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, textDecoration: "none", color: colors.ink }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: colors.navyDark }}>{f.name}</span>
                <span style={{ display: "block", fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
                  /f/{f.slug} · {f.attorneys} {f.attorneys === 1 ? "attorney" : "attorneys"} · {f.staff} staff · signed up {formatCalendarDate(new Date(f.createdAt))}
                  {f.reviewRequestedAt && f.stage === "review" ? ` · asked ${formatCalendarDate(new Date(f.reviewRequestedAt))}` : ""}
                </span>
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {f.toCheck > 0 && <span style={badge("amber")}>{f.toCheck} to check</span>}
                {f.comped && <span style={badge("grey")}>{f.compedUntil ? `Comped to ${f.compedUntil}` : "Comped"}</span>}
                <span style={badge(STAGE[f.stage].tone)}>{STAGE[f.stage].label}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
