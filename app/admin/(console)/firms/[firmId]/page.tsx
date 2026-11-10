import Link from "next/link";
import { notFound } from "next/navigation";
import { AttorneyCheck, CompForm, FirmDecision } from "@/components/admin/firm-controls";
import { Panel } from "@/components/staff/form-ui";
import { requireOperator } from "@/lib/admin/auth";
import { getAdminFirm, type FirmStage } from "@/lib/admin/queries";
import { badge, colors, pageHeading } from "@/lib/booking/ui";
import { formatCalendarDate, formatTimeLabel } from "@/lib/booking/time";

export const metadata = { title: "Firm" };

const STAGE: Record<FirmStage, { label: string; tone: "green" | "red" | "amber" | "grey" }> = {
  review: { label: "Waiting for review", tone: "amber" },
  setup: { label: "Setting up", tone: "grey" },
  live: { label: "Live", tone: "green" },
  suspended: { label: "Suspended", tone: "red" },
};
const STEPS = [
  ["attorney", "An attorney with a roll number and year"],
  ["consult", "A consultation type"],
  ["hours", "Weekly hours"],
  ["contact", "A contact email"],
] as const;

const when = (iso: string) => `${formatCalendarDate(new Date(iso))}, ${formatTimeLabel(new Date(iso))}`;
const muted = { fontSize: 13, color: "oklch(0.5 0.01 258)" } as const;
const th = { textAlign: "left", fontSize: 12, fontWeight: 600, color: "oklch(0.5 0.01 258)", padding: "6px 10px 6px 0" } as const;
const td = { fontSize: 14, padding: "8px 10px 8px 0", verticalAlign: "top" } as const;

/** One firm: its setup, attorneys to check against the Roll of Attorneys, and our decisions. */
export default async function OperatorFirmPage({ params }: PageProps<"/admin/firms/[firmId]">) {
  await requireOperator();
  const { firmId } = await params;
  const firm = await getAdminFirm(firmId);
  if (!firm) notFound();

  const setupDone = Object.values(firm.steps).every(Boolean);
  const anyChecked = firm.attorneys.some((a) => a.isActive && a.checkedAt);
  const canApprove = setupDone && anyChecked;

  return (
    <div>
      <Link href="/admin/firms" style={{ fontSize: 13, color: colors.green, textDecoration: "none" }}>
        ← All firms
      </Link>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, margin: "8px 0 4px" }}>
        <h1 style={{ ...pageHeading, margin: 0 }}>{firm.name}</h1>
        <span id="firm-stage" style={badge(STAGE[firm.stage].tone)}>
          {STAGE[firm.stage].label}
        </span>
        {firm.comped && <span style={badge("grey")}>{firm.compedUntil ? `Comped to ${firm.compedUntil}` : "Comped"}</span>}
      </div>
      <p style={{ ...muted, margin: "0 0 20px" }}>
        {firm.status === "active" ? (
          <a href={`/f/${firm.slug}`} target="_blank" rel="noreferrer" style={{ color: colors.green }}>
            /f/{firm.slug}
          </a>
        ) : (
          <>/f/{firm.slug} (not public)</>
        )}{" "}
        · signed up {when(firm.createdAt)}
        {firm.signer ? ` by ${firm.signer.name} (${firm.signer.email})` : ""}
        {firm.reviewRequestedAt ? ` · asked to go live ${when(firm.reviewRequestedAt)}` : ""}
        {firm.approvedAt ? ` · approved ${when(firm.approvedAt)}` : ""}
      </p>

      <Panel title="Attorneys">
        <p style={{ ...muted, margin: "0 0 12px" }}>
          Look up each name and roll number on the Supreme Court&apos;s Roll of Attorneys (sc.judiciary.gov.ph) and confirm the year
          admitted. Unchecked attorneys stay off the booking page. Changing the name, roll number or year clears the check.
        </p>
        {firm.attorneys.length === 0 ? (
          <p style={muted}>No attorneys yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Roll No.</th>
                  <th style={th}>Admitted</th>
                  <th style={th}>Status</th>
                  <th style={th}>Check</th>
                </tr>
              </thead>
              <tbody>
                {firm.attorneys.map((a) => (
                  <tr key={a.id} data-testid="admin-attorney" data-attorney={a.slug} style={{ borderTop: "1px solid oklch(0.92 0.005 90)" }}>
                    <td style={td}>
                      {a.name}
                      {a.hasAccount && <span style={{ ...muted, display: "block" }}>Has a staff account</span>}
                    </td>
                    <td style={{ ...td, fontFamily: "Menlo, Consolas, monospace" }}>{a.rollNo || "—"}</td>
                    <td style={td}>{a.admittedYear ?? "—"}</td>
                    <td style={td}>
                      {!a.isActive ? (
                        <span style={badge("grey")}>Hidden by firm</span>
                      ) : a.checkedAt ? (
                        <span style={badge("green")} title={a.checkedBy ? `Checked by ${a.checkedBy}` : undefined}>
                          Checked {formatCalendarDate(new Date(a.checkedAt))}
                        </span>
                      ) : (
                        <span style={badge("amber")}>Not checked</span>
                      )}
                    </td>
                    <td style={td}>
                      <AttorneyCheck firmId={firm.id} attorneyId={a.id} name={a.name} checked={Boolean(a.checkedAt)} canCheck={Boolean(a.rollNo && a.admittedYear)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={firm.stage === "live" || firm.stage === "suspended" ? "Status" : "Review"}>
        {(firm.stage === "review" || firm.stage === "setup") && (
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 4 }}>
            {STEPS.map(([key, text]) => (
              <li key={key} data-step={key} data-done={firm.steps[key]} style={{ fontSize: 14 }}>
                <span style={{ color: firm.steps[key] ? colors.green : colors.errorTextAlt, fontWeight: 700, marginRight: 6 }}>{firm.steps[key] ? "✓" : "✗"}</span>
                {text}
              </li>
            ))}
            <li style={{ fontSize: 14 }}>
              <span style={{ color: anyChecked ? colors.green : colors.errorTextAlt, fontWeight: 700, marginRight: 6 }}>{anyChecked ? "✓" : "✗"}</span>
              An active attorney checked on the Roll of Attorneys
            </li>
          </ul>
        )}
        {firm.firmNote && (
          <p style={{ fontSize: 14, margin: "0 0 12px" }}>
            <strong>Last note to the firm:</strong> {firm.firmNote}
          </p>
        )}
        <FirmDecision firmId={firm.id} stage={firm.stage} canApprove={canApprove} />
      </Panel>

      <Panel title="Comp">
        <CompForm firmId={firm.id} comped={firm.comped} until={firm.compedUntil} note={firm.compNote} />
      </Panel>

      <Panel title="Contact and staff">
        <p style={{ fontSize: 14, margin: "0 0 10px" }}>
          {firm.contactEmail ?? "No contact email"}
          {firm.contactPhone ? ` · ${firm.contactPhone}` : ""}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
          {firm.staff.map((s) => (
            <li key={s.email}>
              {s.name} · {s.email} · {s.role}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="History">
        {firm.events.length === 0 ? (
          <p style={muted}>Nothing yet.</p>
        ) : (
          <ol id="firm-history" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {firm.events.map((e, i) => (
              <li key={i} data-action={e.action} style={{ fontSize: 14 }}>
                <span style={muted}>{when(e.at)}</span> · {e.label}
                {e.actor ? ` · ${e.actor}` : ""}
                {e.note && <span style={{ display: "block", ...muted }}>“{e.note}”</span>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
