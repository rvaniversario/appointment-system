import { redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/admin/auth";

export default async function OperatorMfaSetupLayout({ children }: LayoutProps<"/admin/mfa-setup">) {
  const account = await getSessionAccount();
  if (!account || !(await isPlatformAdmin(account.id))) redirect("/admin/login");
  if (await hasVerifiedTotp()) redirect(account.aal === "aal2" ? "/admin/firms" : "/admin/verify");
  return children;
}
