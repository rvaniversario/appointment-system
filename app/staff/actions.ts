"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasVerifiedTotp, isStaffRole } from "@/lib/auth/session";
import type { ActionResult } from "@/app/portal/actions";

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";
const codeSchema = z.string().trim().regex(/^\d{6}$/);

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

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  if (!profile || !isStaffRole(profile.role)) {
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

export type EnrollmentResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

/** Starts authenticator-app enrollment for a signed-in staff member with no verified factor. */
export async function startTotpEnrollment(): Promise<EnrollmentResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/staff/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (!profile || !isStaffRole(profile.role)) redirect("/staff/login");

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
