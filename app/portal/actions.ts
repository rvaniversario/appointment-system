"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.email().max(254);
const codeSchema = z.string().trim().regex(/^\d{6}$/);

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
    options: { shouldCreateUser: false },
  });
  if (error && error.status === 429) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }
  return { ok: true };
}

export async function verifyPortalCode(email: string, code: string): Promise<ActionResult> {
  const parsedEmail = emailSchema.safeParse(email.trim().toLowerCase());
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedEmail.success || !parsedCode.success) {
    return { ok: false, error: "Enter the 6-digit code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail.data,
    token: parsedCode.data,
    type: "email",
  });
  if (error) return { ok: false, error: "That code is invalid or has expired." };

  redirect("/portal/appointments");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
