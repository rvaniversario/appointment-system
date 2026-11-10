"use server";

import { createHash, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { newPasswordSchema, PASSWORD_POLICY_ERROR } from "@/lib/auth/password";
import { emailConfigured } from "@/lib/env.server";
import { sendSignupEmailCode } from "@/lib/notify/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { FIRST_ADMISSION_YEAR, ROLL_NO_PATTERN, slugify, slugProblem } from "./rules";

/**
 * Firm self-service signup, in two steps:
 *   1. startSignup checks the form and emails a 6-digit code to the signer.
 *   2. completeSignup checks the code, creates (or, for an existing client, takes over) the
 *      account, creates the firm as pending with the signer as admin, signs them in and sends
 *      them to two-factor setup.
 * The visitor isn't signed in, so both run with the service role after their own checks.
 */

const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const GENERIC = "Something went wrong. Please try again.";

type Failure = { ok: false; error: string; field?: string };
const fail = (error: string, field?: string): Failure => ({ ok: false, error, ...(field ? { field } : {}) });

const signupSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100),
  email: z.email("Enter a valid email address.").max(254),
  firmName: z.string().trim().min(2, "Enter your firm's name.").max(200),
  slug: z.string().trim().toLowerCase(),
  signerIsAttorney: z.boolean(),
  attorneyName: z.string().trim().min(2, "Enter the attorney's full name.").max(200),
  ibpRollNo: z.string().trim().regex(ROLL_NO_PATTERN, "Enter the attorney's roll number, digits only."),
  admittedYear: z.string().trim().regex(/^\d{4}$/, "Enter the year admitted, like 2012."),
  attested: z.literal(true, "Confirm that you may sign up this firm and that the details are accurate."),
});

export type SignupInput = Omit<z.input<typeof signupSchema>, "attested"> & { attested: boolean };
export type StartResult = { ok: true; codeRequired: boolean } | Failure;

const codeHash = (email: string, code: string) => createHash("sha256").update(`signup:${email}:${code}`).digest("hex");

/** Without email, development skips the code; production can't take signups. */
function emailCheckMode(): "on" | "skip" | "unavailable" {
  if (emailConfigured()) return "on";
  return process.env.NODE_ENV === "production" ? "unavailable" : "skip";
}

type Parsed = z.infer<typeof signupSchema>;

async function check(input: SignupInput): Promise<{ ok: true; data: Parsed } | Failure> {
  const parsed = signupSchema.safeParse({ ...input, email: input.email?.trim().toLowerCase() });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue.message, String(issue.path[0] ?? ""));
  }
  const d = parsed.data;
  const year = Number(d.admittedYear);
  if (year < FIRST_ADMISSION_YEAR || year > new Date().getFullYear()) return fail("Enter the year the attorney was admitted to the bar.", "admittedYear");
  const problem = slugProblem(d.slug);
  if (problem) return fail(problem, "slug");
  if (!(await slugAvailable(d.slug))) return fail("That page address is taken. Try another.", "slug");
  return { ok: true, data: d };
}

async function slugAvailable(slug: string): Promise<boolean> {
  const { data } = await createAdminClient().from("firms").select("id").eq("slug", slug).maybeSingle();
  return !data;
}

/** For the form: whether a page address is free. */
export async function checkSlug(slug: string): Promise<{ ok: true } | Failure> {
  const value = slug.trim().toLowerCase();
  const problem = slugProblem(value);
  if (problem) return fail(problem, "slug");
  return (await slugAvailable(value)) ? { ok: true } : fail("That page address is taken. Try another.", "slug");
}

/** Step 1: checks the form and emails a code. Asking again sends a new code (once a minute). */
export async function startSignup(input: SignupInput): Promise<StartResult> {
  const checked = await check(input);
  if (!checked.ok) return checked;
  const { email, firmName } = checked.data;

  const mode = emailCheckMode();
  if (mode === "skip") return { ok: true, codeRequired: false };
  if (mode === "unavailable") return fail("Signups are paused right now. Please try again later.");

  const admin = createAdminClient();
  const { data: row } = await admin.from("signup_email_codes").select("sends, last_sent_at").eq("email", email).maybeSingle();
  const now = Date.now();
  let sends = 1;
  if (row) {
    const since = now - new Date(row.last_sent_at).getTime();
    if (since < RESEND_SECONDS * 1000) return fail("We just sent a code. Please wait a minute before asking for another.");
    sends = since > 3_600_000 ? 1 : row.sends + 1;
    if (sends > MAX_SENDS_PER_HOUR) return fail("Too many codes were sent to this address. Please try again in an hour.");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { error } = await admin.from("signup_email_codes").upsert(
    {
      email,
      code_hash: codeHash(email, code),
      expires_at: new Date(now + CODE_MINUTES * 60_000).toISOString(),
      attempts: 0,
      sends,
      last_sent_at: new Date(now).toISOString(),
      verified_at: null,
    },
    { onConflict: "email" },
  );
  if (error) {
    console.error("[signup] code save failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  const { sent } = await sendSignupEmailCode({ to: email, code, minutes: CODE_MINUTES, firmName, send: sends });
  if (!sent) return fail("We couldn't send the code. Check the address and try again.", "email");
  return { ok: true, codeRequired: true };
}

const CODE_ERRORS = {
  wrong: "That code isn't right. Check the email we sent and try again.",
  expired: "That code has expired. Ask for a new one.",
  locked: "Too many wrong codes. Ask for a new one.",
  missing: "Ask for a code first.",
} as const;

/** Step 2: checks the code and creates everything. Redirects to two-factor setup on success. */
export async function completeSignup(input: SignupInput & { code: string; password: string }): Promise<Failure> {
  const checked = await check(input);
  if (!checked.ok) return checked;
  const d = checked.data;
  if (!newPasswordSchema.safeParse(input.password).success) return fail(PASSWORD_POLICY_ERROR, "password");

  const mode = emailCheckMode();
  if (mode === "unavailable") return fail("Signups are paused right now. Please try again later.");
  const admin = createAdminClient();
  if (mode === "on") {
    const code = (input.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit code from your email.", "code");
    const { data: result, error } = await admin.rpc("verify_signup_email_code", { p_email: d.email, p_code_hash: codeHash(d.email, code) });
    if (error) {
      console.error("[signup] code check failed", { code: error.code, message: error.message });
      return fail(GENERIC);
    }
    if (result !== "ok") return fail(CODE_ERRORS[result as keyof typeof CODE_ERRORS] ?? GENERIC, "code");
  }

  // The address is proven, so an existing account (say, a client of another firm) can be
  // used: the code shows it's theirs, just as an invite does.
  const { data: existing } = await admin.from("profiles").select("id").eq("email", d.email).maybeSingle();
  let userId: string;
  let createdUser = false;
  if (existing) {
    const { data: membership } = await admin.from("firm_memberships").select("firm_id").eq("profile_id", existing.id).maybeSingle();
    if (membership) return fail("This email already belongs to a firm's staff. Sign in at Firm sign-in instead.", "email");
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: input.password, email_confirm: true });
    if (error || !data.user) {
      console.error("[signup] account creation failed", { status: error?.status, code: error?.code });
      return fail(error?.code === "weak_password" ? PASSWORD_POLICY_ERROR : GENERIC, error?.code === "weak_password" ? "password" : undefined);
    }
    userId = data.user.id;
    createdUser = true;
  }

  const { error: firmError } = await admin.rpc("create_signup_firm", {
    p_profile: userId,
    p_firm_name: d.firmName,
    p_firm_slug: d.slug,
    p_attorney_name: d.attorneyName,
    p_attorney_slug: slugify(d.attorneyName) || "attorney",
    p_ibp_roll_no: d.ibpRollNo,
    p_admitted_year: Number(d.admittedYear),
    p_signer_is_attorney: d.signerIsAttorney,
  });
  if (firmError) {
    if (createdUser) await admin.auth.admin.deleteUser(userId);
    if (firmError.code === "23505") return fail("That page address was just taken. Try another.", "slug");
    if (firmError.message.includes("already_staff")) return fail("This email already belongs to a firm's staff. Sign in at Firm sign-in instead.", "email");
    console.error("[signup] firm creation failed", { code: firmError.code, message: firmError.message });
    return fail(GENERIC);
  }

  if (!createdUser) await admin.auth.admin.updateUserById(userId, { password: input.password });
  await admin.from("profiles").update({ first_name: d.firstName, last_name: d.lastName }).eq("id", userId);
  await admin.from("signup_email_codes").delete().eq("email", d.email);

  const { error: signInError } = await (await createClient()).auth.signInWithPassword({ email: d.email, password: input.password });
  if (signInError) redirect("/staff/login");
  redirect("/staff/mfa-setup");
}
