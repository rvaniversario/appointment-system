"use client";

import { AdminScreen } from "@/components/booking/screens/admin-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

/** The billing tab's remaining sample content, until Phase 5 moves it to real data. */
export function BillingSample() {
  const { state, days, onAdminConflictSearch: onConflictSearchChange, setLeadReassign, reassignLead, approveLead } =
    useStaffSession();

  return (
    <AdminScreen
      activeTab="billing"
      admin={state}
      days={days}
      onConflictSearchChange={onConflictSearchChange}
      onLeadReassignChange={setLeadReassign}
      onReassignLead={reassignLead}
      onApproveLead={approveLead}
    />
  );
}
