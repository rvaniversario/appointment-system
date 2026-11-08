import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { formatMobile } from "@/lib/profile/mobile";
import type { AccountProfile } from "@/lib/profile/types";
import { createClient } from "@/lib/supabase/server";
import type { FirmRole } from "@/lib/supabase/database.types";

/** A firm member's role, or "client" for everyone without a firm membership. */
export type UserRole = FirmRole | "client";
export type StaffRole = FirmRole;

export interface SessionAccount {
  id: string;
  email: string;
  role: UserRole;
  /** The firm this account works for. Null for clients. */
  firmId: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  mobile: string | null;
  dateOfBirth: string | null;
  photoPath: string | null;
  smsOptIn: boolean;
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
    .select("id, email, first_name, middle_name, last_name, mobile, date_of_birth, photo_path, sms_opt_in")
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

  const { data: membership, error: membershipError } = await supabase
    .from("firm_memberships")
    .select("role, firm_id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (membershipError) {
    // Fail closed: a failed lookup must not turn a staff member into a client.
    console.error("[auth] membership lookup failed for signed-in user", {
      code: membershipError.code,
      message: membershipError.message,
    });
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    role: membership?.role ?? "client",
    firmId: membership?.firm_id ?? null,
    firstName: profile.first_name,
    middleName: profile.middle_name,
    lastName: profile.last_name,
    mobile: profile.mobile,
    dateOfBirth: profile.date_of_birth,
    photoPath: profile.photo_path,
    smsOptIn: profile.sms_opt_in,
    aal: data.claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

/** What the portal and staff layouts hand to the client, including a signed URL for the photo. */
export async function toAccountProfile(account: SessionAccount): Promise<AccountProfile> {
  let photoUrl: string | null = null;
  if (account.photoPath) {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from("avatars").createSignedUrl(account.photoPath, 60 * 60);
    if (error) console.error("[auth] could not sign profile photo URL", { message: error.message });
    photoUrl = data?.signedUrl ?? null;
  }

  return {
    id: account.id,
    email: account.email,
    firstName: account.firstName,
    middleName: account.middleName,
    lastName: account.lastName,
    dateOfBirth: account.dateOfBirth ?? "",
    mobile: formatMobile(account.mobile),
    smsOptIn: account.smsOptIn,
    photoUrl,
  };
}

/** For client-portal pages. Open to staff too, because they can be clients of another firm. */
export async function requireClient(): Promise<SessionAccount> {
  const account = await getSessionAccount();
  if (!account) redirect("/portal/login");
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

/** Is this user a member of a firm? Readable before MFA, so sign-in can use it. */
export async function isFirmMember(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("firm_memberships").select("role").eq("profile_id", userId).maybeSingle();
  return data !== null;
}

export async function hasVerifiedTotp(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return (data?.totp ?? []).some((f) => f.status === "verified");
}
