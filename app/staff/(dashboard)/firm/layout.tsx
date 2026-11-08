import { FirmSettingsNav } from "@/components/staff/firm-settings-nav";
import { getStaffContext } from "@/lib/staff/queries";

/** Partners and admins get every section; an attorney only ever opens their own profile here. */
export default async function FirmSettingsLayout({ children }: LayoutProps<"/staff/firm">) {
  const ctx = await getStaffContext();
  return (
    <>
      {ctx.isManager && <FirmSettingsNav />}
      {children}
    </>
  );
}
