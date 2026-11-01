"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsScreen } from "@/components/booking/screens/settings-screen";
import { usePortalSession } from "@/components/portal/portal-session-context";
import type { SettingsTab } from "@/lib/booking/types";

const AVAILABLE_TABS: { key: SettingsTab; label: string }[] = [
  { key: "profile", label: "Update profile" },
  { key: "billing", label: "Billing & invoices" },
];

export default function PortalSettingsPage() {
  const router = useRouter();
  const { state, onSettingsFieldChange, onSettingsPhotoChange, saveSettings, payInvoice } = usePortalSession();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSave = () => {
    if (saveSettings()) setSettingsSaved(true);
  };

  return (
    <SettingsScreen
      settings={state.settings}
      settingsTab={settingsTab}
      settingsSaved={settingsSaved}
      errors={state.errors}
      availableTabs={AVAILABLE_TABS}
      portalInvoiceItems={state.invoices}
      onBack={() => router.push("/portal/appointments")}
      onSetTab={setSettingsTab}
      onFieldChange={onSettingsFieldChange}
      onPhotoChange={onSettingsPhotoChange}
      onSave={handleSave}
      onPayInvoice={payInvoice}
    />
  );
}
