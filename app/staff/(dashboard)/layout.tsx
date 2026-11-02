import { requireStaff } from "@/lib/auth/session";

/** Every dashboard page requires a staff role and an MFA-verified session. */
export default async function StaffDashboardLayout({ children }: LayoutProps<"/staff">) {
  await requireStaff();
  return children;
}
