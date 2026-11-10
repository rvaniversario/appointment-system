import { redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/admin/auth";

export default async function OperatorVerifyLayout({ children }: LayoutProps<"/admin/verify">) {
  const account = await getSessionAccount();
  if (!account || !(await isPlatformAdmin(account.id))) redirect("/admin/login");
  if (account.aal === "aal2") redirect("/admin/firms");
  if (!(await hasVerifiedTotp())) redirect("/admin/mfa-setup");
  return children;
}
