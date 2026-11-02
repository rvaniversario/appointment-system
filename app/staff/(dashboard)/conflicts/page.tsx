"use client";

import { AdminScreen } from "@/components/booking/screens/admin-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffConflictsPage() {
  const { state, days, onAdminConflictSearch: onConflictSearchChange, setLeadReassign, reassignLead, approveLead } =
    useStaffSession();

  return (
    <AdminScreen
      activeTab="conflicts"
      admin={state}
      days={days}
      onConflictSearchChange={onConflictSearchChange}
      onLeadReassignChange={setLeadReassign}
      onReassignLead={reassignLead}
      onApproveLead={approveLead}
    />
  );
}
