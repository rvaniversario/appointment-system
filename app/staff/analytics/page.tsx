"use client";

import { AdminScreen } from "@/components/booking/screens/admin-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";

export default function StaffAnalyticsPage() {
  const { state, days, onAdminRoleChange: onRoleChange, onAdminConflictSearch: onConflictSearchChange, setLeadReassign, reassignLead, approveLead } =
    useStaffSession();

  return (
    <AdminScreen
      activeTab="analytics"
      admin={state}
      days={days}
      onRoleChange={onRoleChange}
      onConflictSearchChange={onConflictSearchChange}
      onLeadReassignChange={setLeadReassign}
      onReassignLead={reassignLead}
      onApproveLead={approveLead}
    />
  );
}
