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
  const { state, accountSettings, payInvoice } = usePortalSession();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  return (
    <SettingsScreen
      account={accountSettings}
      showPasswordFields={false}
      settingsTab={settingsTab}
      availableTabs={AVAILABLE_TABS}
      portalInvoiceItems={state.invoices}
      onBack={() => router.push("/portal/appointments")}
      onSetTab={setSettingsTab}
      onPayInvoice={payInvoice}
    />
  );
}
