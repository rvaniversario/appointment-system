import Link from "next/link";
import { requireOperator } from "@/lib/admin/auth";
import { listPlatformAudit } from "@/lib/admin/queries";
import { card, colors, pageHeading } from "@/lib/booking/ui";
import { formatCalendarDate, formatTimeLabel } from "@/lib/booking/time";

export const metadata = { title: "Audit log" };

/** What operators did, most recent first. */
export default async function OperatorAuditPage() {
  await requireOperator();
  const entries = await listPlatformAudit();
  return (
    <div>
      <h1 style={pageHeading}>Audit log</h1>
      <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", margin: "0 0 16px" }}>Every operator action, latest 200.</p>
      {entries.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>No operator actions yet.</div>
      ) : (
        <ol id="platform-audit" style={{ ...card("8px 20px"), listStyle: "none", margin: 0 }}>
          {entries.map((e, i) => (
            <li key={i} data-action={e.action} style={{ fontSize: 14, padding: "10px 0", borderTop: i ? "1px solid oklch(0.92 0.005 90)" : "none" }}>
              <span style={{ color: "oklch(0.5 0.01 258)", fontSize: 13 }}>
                {formatCalendarDate(new Date(e.at))}, {formatTimeLabel(new Date(e.at))}
              </span>{" "}
              · {e.label}
              {e.firmId && (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/admin/firms/${e.firmId}`} style={{ color: colors.green }}>
                    {e.firmName ?? "Deleted firm"}
                  </Link>
                </>
              )}
              {e.actor ? ` · by ${e.actor}` : ""}
              {e.note && <span style={{ display: "block", fontSize: 13, color: "oklch(0.5 0.01 258)" }}>“{e.note}”</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
