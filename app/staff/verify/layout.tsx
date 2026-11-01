import { redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp, isStaffRole } from "@/lib/auth/session";

/** Second-factor step: needs a password-verified staff session with an enrolled authenticator. */
export default async function StaffVerifyLayout({ children }: LayoutProps<"/staff/verify">) {
  const account = await getSessionAccount();
  if (!account || !isStaffRole(account.role)) redirect("/staff/login");
  if (account.aal === "aal2") redirect("/staff/calendar");
  if (!(await hasVerifiedTotp())) redirect("/staff/mfa-setup");
  return children;
}
