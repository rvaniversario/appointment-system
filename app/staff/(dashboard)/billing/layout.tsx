import { requireStaff } from "@/lib/auth/session";

/** Billing is limited to partners and admins (also enforced by RLS). */
export default async function StaffBillingLayout({ children }: LayoutProps<"/staff/billing">) {
  await requireStaff({ manager: true });
  return children;
}
