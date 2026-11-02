"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export type ActionResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.email().max(254);
// Supabase's email OTP length is a project setting (6–10 digits); accept any of them.
const codeSchema = z.string().trim().regex(/^\d{6,10}$/);

/**
 * Emails a 6-digit sign-in code. Portal accounts are created when a client books,
 * so this never creates users. The response is identical whether or not the email
 * has an account, to avoid revealing who is a client of the firm.
 */
export async function requestPortalCode(email: string): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      // Lets the link in the email sign the user in too (same browser), besides the code.
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/portal/appointments`,
    },
  });
  if (!error) return { ok: true };

  // "No such account" must look like success, so the form can't reveal who is a client.
  if (NO_ACCOUNT_ERROR_CODES.has(error.code ?? "")) return { ok: true };

  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }

  // Anything else is a delivery/config problem (e.g. SMTP rejected the message). Surface it.
  console.error("[portal] signInWithOtp failed", { status: error.status, code: error.code, message: error.message });
  return { ok: false, error: "We couldn't send your code right now. Please try again shortly." };
}

const NO_ACCOUNT_ERROR_CODES = new Set(["otp_disabled", "user_not_found", "signup_disabled"]);

export async function verifyPortalCode(email: string, code: string): Promise<ActionResult> {
  const parsedEmail = emailSchema.safeParse(email.trim().toLowerCase());
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedEmail.success || !parsedCode.success) {
    return { ok: false, error: "Enter the code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail.data,
    token: parsedCode.data,
    type: "email",
  });
  if (error) {
    console.error("[portal] verifyOtp failed", { status: error.status, code: error.code, message: error.message });
    return { ok: false, error: "That code is invalid or has expired. Use the code from the most recent email." };
  }

  redirect("/portal/appointments");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
