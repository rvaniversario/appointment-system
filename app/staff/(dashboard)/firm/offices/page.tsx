import { OfficesEditor } from "@/components/staff/offices-editor";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmOffices, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Offices" };

export default async function FirmOfficesPage() {
  const ctx = await requireManagerContext();
  return (
    <div>
      <h2 style={pageHeading}>Offices</h2>
      <OfficesEditor offices={await getFirmOffices(ctx)} />
    </div>
  );
}
