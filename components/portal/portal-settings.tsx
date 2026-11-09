"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsScreen } from "@/components/booking/screens/settings-screen";
import type { SettingsTab } from "@/lib/booking/types";
import type { PortalInvoice } from "@/lib/portal/types";
import { EmailChange } from "./email-change";
import { usePortalSession } from "./portal-session-context";

const AVAILABLE_TABS: { key: SettingsTab; label: string }[] = [
  { key: "profile", label: "Update profile" },
  { key: "billing", label: "Billing & invoices" },
];

export function PortalSettings({
  invoices,
  canChangeEmail,
  pendingEmail,
}: {
  invoices: PortalInvoice[];
  canChangeEmail: boolean;
  pendingEmail: string | null;
}) {
  const router = useRouter();
  const { accountSettings } = usePortalSession();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  return (
    <SettingsScreen
      account={accountSettings}
      showPasswordFields={false}
      showSmsOptIn
      emailChange={canChangeEmail ? <EmailChange pendingEmail={pendingEmail} /> : undefined}
      settingsTab={settingsTab}
      availableTabs={AVAILABLE_TABS}
      portalInvoiceItems={invoices}
      onBack={() => router.push("/portal/appointments")}
      onSetTab={setSettingsTab}
    />
  );
}
