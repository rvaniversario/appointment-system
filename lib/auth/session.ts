import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export type StaffRole = Exclude<UserRole, "client">;

export interface SessionAccount {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  /** "aal2" once the user has completed MFA in this session. */
  aal: "aal1" | "aal2";
}

const STAFF_ROLES: readonly UserRole[] = ["attorney", "partner", "admin"];
export const isStaffRole = (role: UserRole): role is StaffRole => STAFF_ROLES.includes(role);
export const isManagerRole = (role: UserRole) => role === "partner" || role === "admin";

/**
 * The signed-in account, verified server-side (getClaims validates the JWT), or null.
 * Cached per request so layouts and pages can both call it.
 */
export const getSessionAccount = cache(async (): Promise<SessionAccount | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, role, first_name, last_name")
    .eq("id", data.claims.sub)
    .single();
  if (!profile) {
    // A valid session without a readable profile means a schema/migration problem, not a sign-out.
    console.error("[auth] profile lookup failed for signed-in user", {
      code: profileError?.code,
      message: profileError?.message,
    });
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    aal: data.claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

/** For client-portal pages. Staff are sent to their dashboard. */
export async function requireClient(): Promise<SessionAccount> {
  const account = await getSessionAccount();
  if (!account) redirect("/portal/login");
  if (isStaffRole(account.role)) redirect("/staff/calendar");
  return account;
}

/**
 * For staff pages: requires a staff role AND an MFA-verified (aal2) session.
 * Sends users without a verified authenticator to enrollment.
 */
export async function requireStaff(options: { manager?: boolean } = {}): Promise<SessionAccount> {
  const account = await getSessionAccount();
  if (!account) redirect("/staff/login");
  if (!isStaffRole(account.role)) redirect("/portal/appointments");

  if (account.aal !== "aal2") {
    redirect((await hasVerifiedTotp()) ? "/staff/verify" : "/staff/mfa-setup");
  }
  if (options.manager && !isManagerRole(account.role)) redirect("/staff/calendar");
  return account;
}

export async function hasVerifiedTotp(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).some((f) => f.status === "verified");
}
