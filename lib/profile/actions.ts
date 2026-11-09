"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionAccount, isStaffRole, type SessionAccount } from "@/lib/auth/session";
import { normalizeMobile } from "@/lib/profile/mobile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/portal/actions";

const SIGNED_OUT_ERROR = "Your session has ended. Please sign in again.";

function isValidDateOfBirth(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(value) &&
    date.getUTCFullYear() >= 1900 &&
    date.getTime() <= Date.now()
  );
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(100, "First name is too long."),
  middleName: z.string().trim().max(100, "Middle name is too long."),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100, "Last name is too long."),
  dateOfBirth: z.string().trim().refine(isValidDateOfBirth, "Enter a valid date of birth."),
  mobile: z
    .string()
    .trim()
    .refine((v) => !v || normalizeMobile(v) !== null, "Enter a Philippine mobile number, like 0917 123 4567."),
  /** Left unchanged when omitted. */
  smsOptIn: z.boolean().optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

/** The caller's account. Staff must have passed MFA, matching what requireStaff enforces on pages. */
async function getEditableAccount(): Promise<SessionAccount | null> {
  const account = await getSessionAccount();
  if (!account) return null;
  if (isStaffRole(account.role) && account.aal !== "aal2") return null;
  return account;
}

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const account = await getEditableAccount();
  if (!account) return { ok: false, error: SIGNED_OUT_ERROR };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { firstName, middleName, lastName, dateOfBirth, mobile, smsOptIn } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      date_of_birth: dateOfBirth || null,
      mobile: mobile ? normalizeMobile(mobile) : null,
      ...(smsOptIn === undefined ? {} : { sms_opt_in: smsOptIn }),
    })
    .eq("id", account.id)
    // Returning the row makes an update that matched nothing an error instead of a silent success.
    .select("id")
    .single();
  if (error) {
    console.error("[profile] update failed", { code: error.code, message: error.message });
    return { ok: false, error: "We couldn't save your changes. Please try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

const newEmailSchema = z.email("Enter a valid email address.").max(254, "That email address is too long.");

/**
 * Starts a client's sign-in email change. Supabase emails a link to both the current and the
 * new address, and the email changes only after both are opened (/auth/confirm). Staff emails
 * aren't changed here. An address that already has an account gets the same answer as any
 * other, so this can't be used to find out who is a client; it just never receives a link.
 */
export async function requestEmailChange(email: string): Promise<ActionResult> {
  const account = await getSessionAccount();
  if (!account) return { ok: false, error: SIGNED_OUT_ERROR };
  if (isStaffRole(account.role)) return { ok: false, error: "Staff sign-in emails can't be changed here. Ask your firm's admin." };

  const parsed = newEmailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data === account.email.toLowerCase()) return { ok: false, error: "That's already your email." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  if (error && error.code !== "email_exists") {
    if (error.status === 429 || error.code === "over_email_send_rate_limit") {
      return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
    }
    console.error("[profile] email change failed", { status: error.status, code: error.code, message: error.message });
    return { ok: false, error: "We couldn't start the change right now. Please try again shortly." };
  }

  revalidatePath("/portal/settings");
  return { ok: true };
}

/** Points the profile at a photo the browser just uploaded, then removes the previous one. */
export async function setProfilePhoto(path: string): Promise<ActionResult> {
  const account = await getEditableAccount();
  if (!account) return { ok: false, error: SIGNED_OUT_ERROR };

  const expectedPath = new RegExp(`^${account.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  if (typeof path !== "string" || !expectedPath.test(path)) {
    return { ok: false, error: "We couldn't save your photo. Please try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ photo_path: path })
    .eq("id", account.id)
    .select("id")
    .single();
  if (error) {
    console.error("[profile] photo update failed", { code: error.code, message: error.message });
    return { ok: false, error: "We couldn't save your photo. Please try again." };
  }

  if (account.photoPath && account.photoPath !== path) {
    const { error: removeError } = await supabase.storage.from("avatars").remove([account.photoPath]);
    if (removeError) console.error("[profile] old photo not removed", { message: removeError.message });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
