import Link from "next/link";
import { ApproveButton } from "@/components/staff/review-actions";
import { badge, card, colors, pageHeading } from "@/lib/booking/ui";
import { getQueue, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Intake queue" };

export default async function StaffQueuePage() {
  const ctx = await getStaffContext();
  const queue = await getQueue(ctx);

  return (
    <div>
      <h2 style={pageHeading}>Intake queue</h2>
      <p style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", margin: "-8px 0 18px" }}>
        Confirmed bookings waiting for review. Open one to see the intake, documents and any conflict matches.
      </p>
      {queue.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>Nothing to review.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {queue.map((item) => (
            <div key={item.id} style={card("16px 20px")} data-testid="queue-item">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: colors.navyDark }}>
                    {item.clientName}
                    {item.urgency === "urgent" && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.errorText }}> · Urgent</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: "oklch(0.5 0.01 258)", marginTop: 2 }}>
                    {item.caseType || "No case type"} · {item.consultLabel} with {item.attorneyName} · {item.whenLabel}
                  </div>
                </div>
                <span style={badge(item.conflictCount ? "red" : "amber")}>
                  {item.conflictCount
                    ? `${item.conflictCount} possible conflict${item.conflictCount === 1 ? "" : "s"}`
                    : "Pending review"}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
                <Link
                  href={`/staff/appointments/${item.id}`}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid oklch(0.85 0.005 90)",
                    borderRadius: 7,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: colors.navy,
                    textDecoration: "none",
                  }}
                >
                  Review
                </Link>
                {/* A possible conflict needs a look at the details before approving. */}
                {item.conflictCount === 0 && <ApproveButton appointmentId={item.id} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
