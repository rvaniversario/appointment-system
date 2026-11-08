import { AttorneyForm } from "@/components/staff/attorney-form";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmOffices, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Add attorney" };

export default async function NewAttorneyPage() {
  const ctx = await requireManagerContext();
  return (
    <div>
      <h2 style={pageHeading}>Add attorney</h2>
      <AttorneyForm offices={await getFirmOffices(ctx)} />
    </div>
  );
}
