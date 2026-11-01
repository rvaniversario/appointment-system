import { redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp, isStaffRole } from "@/lib/auth/session";

/** First-login enrollment: password-verified staff without an authenticator app yet. */
export default async function StaffMfaSetupLayout({ children }: LayoutProps<"/staff/mfa-setup">) {
  const account = await getSessionAccount();
  if (!account || !isStaffRole(account.role)) redirect("/staff/login");
  if (await hasVerifiedTotp()) redirect(account.aal === "aal2" ? "/staff/calendar" : "/staff/verify");
  return children;
}
