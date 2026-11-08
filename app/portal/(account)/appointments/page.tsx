import { AppointmentsView } from "@/components/portal/appointments-view";
import { PortalPage } from "@/components/portal/portal-page";
import { requireClient } from "@/lib/auth/session";
import { getPortalAppointments } from "@/lib/portal/queries";

export const metadata = { title: "Your appointments" };

export default async function PortalAppointmentsPage() {
  const account = await requireClient();
  const appointments = await getPortalAppointments(account);

  return (
    <PortalPage active="appointments">
      <AppointmentsView appointments={appointments} />
    </PortalPage>
  );
}
