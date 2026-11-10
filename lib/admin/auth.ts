import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getSessionAccount, hasVerifiedTotp, type SessionAccount } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** Is this account one of our operators? platform_admins is service-role only. */
export const isPlatformAdmin = cache(async (userId: string): Promise<boolean> => {
  const { data, error } = await createAdminClient().from("platform_admins").select("profile_id").eq("profile_id", userId).maybeSingle();
  if (error) console.error("[admin] operator lookup failed", { code: error.code, message: error.message });
  return Boolean(data);
});

/** Where an operator who has signed in with a password goes next. */
export async function operatorSecondStep(): Promise<string> {
  return (await hasVerifiedTotp()) ? "/admin/verify" : "/admin/mfa-setup";
}

/**
 * For operator pages: an operator account with a two-factor (aal2) session. Everyone else who
 * is signed in gets "not found", so the area doesn't advertise itself.
 */
export async function requireOperator(): Promise<SessionAccount> {
  const account = await getSessionAccount();
  if (!account) redirect("/admin/login");
  if (!(await isPlatformAdmin(account.id))) notFound();
  if (account.aal !== "aal2") redirect(await operatorSecondStep());
  return account;
}
