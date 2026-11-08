import { PortalSettings } from "@/components/portal/portal-settings";
import { requireClient } from "@/lib/auth/session";
import { getPortalInvoices } from "@/lib/portal/queries";

export const metadata = { title: "Account settings" };

export default async function PortalSettingsPage() {
  const account = await requireClient();
  return <PortalSettings invoices={await getPortalInvoices(account)} />;
}
