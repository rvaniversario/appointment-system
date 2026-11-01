"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsScreen } from "@/components/booking/screens/settings-screen";
import { useStaffSession } from "@/components/staff/staff-session-context";
import type { SettingsTab } from "@/lib/booking/types";

const AVAILABLE_TABS: { key: SettingsTab; label: string }[] = [{ key: "profile", label: "Update profile" }];

export default function StaffSettingsPage() {
  const router = useRouter();
  const { state, onSettingsFieldChange, onSettingsPhotoChange, saveSettings } = useStaffSession();
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSave = () => {
    if (saveSettings()) setSettingsSaved(true);
  };

  return (
    <SettingsScreen
      settings={state.settings}
      settingsTab="profile"
      settingsSaved={settingsSaved}
      errors={state.errors}
      availableTabs={AVAILABLE_TABS}
      portalInvoiceItems={[]}
      onBack={() => router.push("/staff/calendar")}
      onSetTab={() => {}}
      onFieldChange={onSettingsFieldChange}
      onPhotoChange={onSettingsPhotoChange}
      onSave={handleSave}
      onPayInvoice={() => {}}
    />
  );
}
