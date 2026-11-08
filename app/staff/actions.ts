"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedTotp, isFirmMember, requireStaff } from "@/lib/auth/session";
import type { ActionResult } from "@/app/portal/actions";

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";
const codeSchema = z.string().trim().regex(/^\d{6}$/);
// Mirrors the Supabase Auth password policy; 72 is the bcrypt limit Supabase enforces.
const newPasswordSchema = z.string().min(12).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/);
const PASSWORD_POLICY_ERROR =
  "Use 12 to 72 characters with at least one uppercase letter, one lowercase letter and one number.";

export async function staffSignIn(email: string, password: string): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse({ email: email.trim().toLowerCase(), password });
  if (!parsed.success) return { ok: false, error: "Enter your work email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.status === 429) return { ok: false, error: "Too many attempts. Please wait and try again." };
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  if (!(await isFirmMember(data.user.id))) {
    await supabase.auth.signOut();
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  redirect((await hasVerifiedTotp()) ? "/staff/verify" : "/staff/mfa-setup");
}

/** Second factor for staff who already have an authenticator app enrolled. */
export async function staffVerifyTotp(code: string): Promise<ActionResult> {
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedCode.success) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/staff/login");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsedCode.data });
  if (error) return { ok: false, error: "That code is incorrect. Check your authenticator app and try again." };

  redirect("/staff/calendar");
}

/** Changes the password of the signed-in, MFA-verified staff member. */
export async function updateStaffPassword(password: string): Promise<ActionResult> {
  await requireStaff();

  const parsed = newPasswordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: PASSWORD_POLICY_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (!error) return { ok: true };

  switch (error.code) {
    case "same_password":
      return { ok: false, error: "Your new password must be different from your current password." };
    case "weak_password":
      return { ok: false, error: PASSWORD_POLICY_ERROR };
    case "reauthentication_needed":
      return { ok: false, error: "For your security, sign out and sign back in, then change your password." };
  }
  if (error.status === 429) return { ok: false, error: "Too many attempts. Please wait and try again." };

  console.error("[staff] password update failed", { status: error.status, code: error.code, message: error.message });
  return { ok: false, error: "We couldn't update your password. Your current password still works." };
}

export type EnrollmentResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

/** Starts authenticator-app enrollment for a signed-in staff member with no verified factor. */
export async function startTotpEnrollment(): Promise<EnrollmentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/staff/login");

  if (!(await isFirmMember(userData.user.id))) redirect("/staff/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) redirect("/staff/verify");

  // Clear abandoned, never-verified enrollments so a fresh QR code can be issued.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) return { ok: false, error: "Could not start two-factor setup. Please try again." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTotpEnrollment(factorId: string, code: string): Promise<ActionResult> {
  const parsed = z.object({ factorId: z.string().min(1), code: codeSchema }).safeParse({ factorId, code });
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { ok: false, error: "That code is incorrect. Scan the QR code again and retry." };

  redirect("/staff/calendar");
}
