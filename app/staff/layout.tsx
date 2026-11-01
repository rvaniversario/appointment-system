import { StaffSessionProvider } from "@/components/staff/staff-session-context";
import { StaffChrome } from "@/components/staff/staff-chrome";
import { getSessionAccount, isManagerRole, isStaffRole } from "@/lib/auth/session";

export const metadata = { robots: { index: false, follow: false } };

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const session = await getSessionAccount();
  const account =
    session && isStaffRole(session.role) && session.aal === "aal2"
      ? {
          email: session.email,
          firstName: session.firstName,
          lastName: session.lastName,
          role: isManagerRole(session.role) ? ("partner" as const) : ("attorney" as const),
        }
      : null;

  return (
    <StaffSessionProvider account={account}>
      <StaffChrome>{children}</StaffChrome>
    </StaffSessionProvider>
  );
}
