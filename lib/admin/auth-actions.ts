"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/app/portal/actions";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin, operatorSecondStep } from "./auth";

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";
const codeSchema = z.string().trim().regex(/^\d{6}$/);

/** Password step. Anyone who isn't an operator gets the same answer as a wrong password. */
export async function operatorSignIn(email: string, password: string): Promise<ActionResult> {
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(256) })
    .safeParse({ email: email.trim().toLowerCase(), password });
  if (!parsed.success) return { ok: false, error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    if (error?.status === 429) return { ok: false, error: "Too many attempts. Please wait and try again." };
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (!(await isPlatformAdmin(data.user.id))) {
    await supabase.auth.signOut();
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  redirect(await operatorSecondStep());
}

/** The signed-in user, if they're an operator; otherwise back to sign-in. */
async function operatorUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isPlatformAdmin(data.user.id))) redirect("/admin/login");
  return supabase;
}

export async function operatorVerifyTotp(code: string): Promise<ActionResult> {
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedCode.success) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await operatorUser();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/admin/mfa-setup");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsedCode.data });
  if (error) return { ok: false, error: "That code is incorrect. Check your authenticator app and try again." };
  redirect("/admin/firms");
}

export type OperatorEnrollment = { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: string };

export async function startOperatorTotpEnrollment(): Promise<OperatorEnrollment> {
  const supabase = await operatorUser();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) redirect("/admin/verify");

  // Clear abandoned, never-verified enrollments so a fresh QR code can be issued.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app" });
  if (error || !data) return { ok: false, error: "Could not start two-factor setup. Please try again." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmOperatorTotpEnrollment(factorId: string, code: string): Promise<ActionResult> {
  const parsed = z.object({ factorId: z.string().min(1), code: codeSchema }).safeParse({ factorId, code });
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await operatorUser();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return { ok: false, error: "That code is incorrect. Scan the QR code again and retry." };
  redirect("/admin/firms");
}

export async function operatorSignOut(): Promise<void> {
  await (await createClient()).auth.signOut();
  redirect("/admin/login");
}
