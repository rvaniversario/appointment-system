import "server-only";
import { redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp, isStaffRole } from "@/lib/auth/session";

/** Sends an already signed-in user from a login page to where they belong. */
export async function redirectIfSignedIn(): Promise<void> {
  const account = await getSessionAccount();
  if (!account) return;
  if (!isStaffRole(account.role)) redirect("/portal/appointments");
  if (account.aal === "aal2") redirect("/staff/calendar");
  redirect((await hasVerifiedTotp()) ? "/staff/verify" : "/staff/mfa-setup");
}
