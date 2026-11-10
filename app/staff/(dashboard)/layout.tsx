import { StaffNav } from "@/components/staff/staff-nav";
import { LaunchPanel } from "@/components/staff/launch-panel";
import { getFirmLaunchState } from "@/lib/firm/queries";
import { getQueueCount, getStaffContext } from "@/lib/staff/queries";

const ROLE_LABELS = { attorney: "Attorney", partner: "Partner", admin: "Admin" } as const;

/** Every dashboard page requires a staff role and an MFA-verified session (getStaffContext checks both). */
export default async function StaffDashboardLayout({ children }: LayoutProps<"/staff">) {
  const ctx = await getStaffContext();
  const [queueCount, launch] = await Promise.all([getQueueCount(ctx), getFirmLaunchState(ctx)]);
  const role = ROLE_LABELS[ctx.account.role as keyof typeof ROLE_LABELS] ?? "Staff";

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 32px 80px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: 26, fontWeight: 600, color: "oklch(0.25 0.01 258)", margin: "0 0 4px" }}>
          Staff Dashboard
        </h1>
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>Signed in as: {role}</div>
      </div>
      {!ctx.isManager && !ctx.attorneyId && (
        <div role="status" style={{ background: "oklch(0.97 0.02 85)", border: "1px solid oklch(0.88 0.06 85)", borderRadius: 8, padding: "10px 14px", fontSize: 13.5, marginBottom: 20 }}>
          Your account isn&apos;t linked to an attorney profile yet, so there&apos;s nothing to show. Ask a partner or admin to link it.
        </div>
      )}
      {launch.status !== "active" && <LaunchPanel state={launch} isManager={ctx.isManager} />}
      <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 32 }}>
        <StaffNav isManager={ctx.isManager} queueCount={queueCount} ownAttorneyId={ctx.attorneyId} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
