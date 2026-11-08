import type { ReactNode } from "react";
import Link from "next/link";
import {
  MeetingLinkForm,
  MessageClientButton,
  OutcomeButtons,
  StaffDocuments,
} from "@/components/staff/appointment-controls";
import { ReviewActions } from "@/components/staff/review-actions";
import { badge, card, colors, linkButton, pageHeading } from "@/lib/booking/ui";
import { getAppointmentDetail, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Appointment" };

const STATUS: Record<string, { label: string; tone: Parameters<typeof badge>[0] }> = {
  confirmed: { label: "Confirmed", tone: "green" },
  completed: { label: "Completed", tone: "grey" },
  no_show: { label: "Client didn't attend", tone: "amber" },
  canceled: { label: "Canceled", tone: "red" },
};
const REVIEW: Record<string, string> = { pending: "Waiting for review", approved: "Approved", declined: "Declined" };
const MODE: Record<string, string> = { video: "Video call", phone: "Phone call", in_person: "In person" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ ...card(), marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: colors.navyDark, margin: "0 0 12px" }}>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, fontSize: 14, padding: "4px 0" }}>
      <div style={{ color: "oklch(0.5 0.01 258)" }}>{label}</div>
      <div style={{ color: colors.ink, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export default async function StaffAppointmentPage({ params }: PageProps<"/staff/appointments/[appointmentId]">) {
  const ctx = await getStaffContext();
  const { appointmentId } = await params;
  const a = await getAppointmentDetail(ctx, appointmentId);
  const status = STATUS[a.status] ?? { label: a.status, tone: "grey" as const };
  const live = a.status === "confirmed";

  return (
    <div>
      <Link href="/staff/queue" style={{ ...linkButton, textDecoration: "none", display: "inline-block", marginBottom: 14 }}>
        ← Intake queue
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h2 style={{ ...pageHeading, margin: "0 0 4px" }}>{a.intake?.name ?? "Client"}</h2>
          <div style={{ fontSize: 14, color: "oklch(0.5 0.01 258)", marginBottom: 18 }}>
            {a.consultLabel} with {a.attorneyName} · {a.whenLabel} · {a.durationMinutes} min · {MODE[a.mode]}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span style={badge(status.tone)}>{status.label}</span>
          {a.status !== "canceled" && <span style={badge(a.reviewStatus === "pending" ? "amber" : "grey")}>{REVIEW[a.reviewStatus]}</span>}
        </div>
      </div>

      {a.conflicts.length > 0 && (
        <section
          role="note"
          style={{ background: "oklch(0.97 0.03 25)", border: "1px solid oklch(0.85 0.1 25)", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.errorTextStrong, marginBottom: 8 }}>
            Possible conflict of interest. The client hasn&apos;t been told.
          </div>
          {a.conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 13.5, color: colors.errorTextStrong, padding: "2px 0" }}>
              &ldquo;{c.matchedName}&rdquo; resembles <strong>{c.partyName}</strong> ({c.matter}
              {c.attorneyName ? `, ${c.attorneyName}` : ""}) · {c.score}% match
            </div>
          ))}
        </section>
      )}

      {live && a.reviewStatus === "pending" && (
        <Section title="Review">
          <ReviewActions appointmentId={a.id} canReassign={ctx.isManager} paid={a.payment?.status === "paid"} options={a.reassignOptions} />
        </Section>
      )}
      {a.status === "canceled" && a.cancelReason && (
        <Section title="Canceled">
          <div style={{ fontSize: 14 }}>Reason: {a.cancelReason}</div>
        </Section>
      )}

      <Section title="Intake">
        {a.intake ? (
          <>
            <Field label="Email">{a.intake.email}</Field>
            <Field label="Mobile">
              +{a.intake.phone}
              {a.intake.smsOptIn ? " · agreed to SMS" : ""}
            </Field>
            <Field label="Case type">{a.intake.caseType}</Field>
            <Field label="Urgency">{a.intake.urgency === "urgent" ? "Urgent" : "Standard"}</Field>
            <Field label="Opposing party">{a.intake.opposingParty || "None given"}</Field>
            <Field label="Details">{a.intake.details}</Field>
          </>
        ) : (
          <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>No intake was submitted.</div>
        )}
        {a.agreement && (
          <Field label="Agreement">
            Signed by {a.agreement.signatureName} on {a.agreement.signedLabel} (version {a.agreement.version})
          </Field>
        )}
        {a.payment && (
          <Field label="Payment">
            {a.payment.amountLabel} · {a.payment.status === "refunded" ? "Refunded" : "Paid online"}
          </Field>
        )}
      </Section>

      {(live || a.status === "completed" || a.status === "no_show") && (
        <>
          {a.mode === "video" && live && (
            <Section title="Meeting link">
              <MeetingLinkForm appointmentId={a.id} url={a.meetingUrl} />
            </Section>
          )}
          {a.started && (
            <Section title="Outcome">
              <OutcomeButtons appointmentId={a.id} status={a.status} />
            </Section>
          )}
        </>
      )}

      {a.clientId && (
        <Section title="Documents">
          <StaffDocuments appointmentId={a.id} documents={a.documents} />
        </Section>
      )}

      {a.clientId && (
        <div style={{ marginTop: 4 }}>
          <MessageClientButton appointmentId={a.id} />
        </div>
      )}
    </div>
  );
}
