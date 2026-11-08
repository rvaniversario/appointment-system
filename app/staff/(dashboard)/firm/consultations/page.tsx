import { ConsultTypesEditor } from "@/components/staff/consult-types-editor";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmConsultTypes, requireManagerContext } from "@/lib/firm/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Consultation types" };

export default async function FirmConsultationsPage() {
  const ctx = await requireManagerContext();
  const [types, { data: acceptsPayments }] = await Promise.all([
    getFirmConsultTypes(ctx),
    createAdminClient().rpc("firm_accepts_payments", { p_firm: ctx.firmId }),
  ]);
  return (
    <div>
      <h2 style={pageHeading}>Consultation types</h2>
      <ConsultTypesEditor types={types} acceptsPayments={Boolean(acceptsPayments)} />
    </div>
  );
}
