import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/auth/session";
import { isPlatformAdmin, operatorSecondStep } from "@/lib/admin/auth";

/** Signed-in operators skip the password step. Anyone else can sign in here as an operator. */
export default async function OperatorLoginLayout({ children }: LayoutProps<"/admin/login">) {
  const account = await getSessionAccount();
  if (account && (await isPlatformAdmin(account.id))) redirect(account.aal === "aal2" ? "/admin/firms" : await operatorSecondStep());
  return children;
}
