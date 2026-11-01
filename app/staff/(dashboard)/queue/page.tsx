"use client";

import { AdminScreen } from "@/components/booking/screens/admin-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffQueuePage() {
  const { state, days, onAdminConflictSearch: onConflictSearchChange, setLeadReassign, reassignLead, approveLead } =
    useStaffSession();

  return (
    <AdminScreen
      activeTab="queue"
      admin={state}
      days={days}
      onConflictSearchChange={onConflictSearchChange}
      onLeadReassignChange={setLeadReassign}
      onReassignLead={reassignLead}
      onApproveLead={approveLead}
    />
  );
}
