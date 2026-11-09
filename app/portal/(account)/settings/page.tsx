import { PortalSettings } from "@/components/portal/portal-settings";
import { isStaffRole, requireClient } from "@/lib/auth/session";
import { getPortalInvoices } from "@/lib/portal/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account settings" };

export default async function PortalSettingsPage() {
  const account = await requireClient();
  // An email change waiting for its confirmation links. Staff change emails elsewhere.
  let pendingEmail: string | null = null;
  if (!isStaffRole(account.role)) {
    const { data } = await (await createClient()).auth.getUser();
    pendingEmail = data.user?.new_email ?? null;
  }
  return (
    <PortalSettings
      invoices={await getPortalInvoices(account)}
      canChangeEmail={!isStaffRole(account.role)}
      pendingEmail={pendingEmail}
    />
  );
}
