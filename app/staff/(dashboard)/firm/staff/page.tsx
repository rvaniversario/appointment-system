import { StaffManager } from "@/components/staff/staff-manager";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmAttorneys, getFirmMembers, getOpenInvites, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Staff" };

export default async function FirmStaffPage() {
  const ctx = await requireManagerContext();
  const [members, invites, attorneys] = await Promise.all([getFirmMembers(ctx), getOpenInvites(ctx), getFirmAttorneys(ctx)]);
  // Profiles nobody signs in as yet, and no open invite is waiting to claim.
  const claimed = new Set(invites.map((i) => i.attorneyId));
  const unlinked = attorneys.filter((a) => !a.memberId && !claimed.has(a.id)).map((a) => ({ id: a.id, name: a.fullName }));
  return (
    <div>
      <h2 style={pageHeading}>Staff</h2>
      <StaffManager members={members} invites={invites} unlinkedAttorneys={unlinked} />
    </div>
  );
}
