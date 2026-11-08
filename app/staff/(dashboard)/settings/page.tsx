"use client";

import { useRouter } from "next/navigation";
import { SettingsScreen } from "@/components/booking/screens/settings-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";
import type { SettingsTab } from "@/lib/booking/types";

const AVAILABLE_TABS: { key: SettingsTab; label: string }[] = [{ key: "profile", label: "Update profile" }];

export default function StaffSettingsPage() {
  const router = useRouter();
  const { accountSettings } = useStaffSession();

  return (
    <SettingsScreen
      account={accountSettings}
      showPasswordFields
      settingsTab="profile"
      availableTabs={AVAILABLE_TABS}
      portalInvoiceItems={[]}
      onBack={() => router.push("/staff/calendar")}
      onSetTab={() => {}}
    />
  );
}
