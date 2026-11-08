"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionAccount } from "@/lib/auth/session";
import { newPasswordSchema, PASSWORD_POLICY_ERROR } from "@/lib/auth/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "./queries";

/**
 * Accepting a staff invite. The visitor holding the link isn't staff yet, so these run with
 * the service role after checking the token.
 *
 * - A new email: the link is enough. The firm's partner or admin vouched for it, and there is
 *   no existing account to take over.
 * - An email that already has an account (for example, a client of some firm): the visitor
 *   must prove it's theirs, by being signed in as it or with a code emailed to it. Otherwise
 *   anyone holding a leaked link could set the password on someone else's account.
 */

type Failure = { ok: false; error: string; needsCode?: boolean };
const fail = (error: string, needsCode = false): Failure => ({ ok: false, error, ...(needsCode ? { needsCode } : {}) });
const GENERIC = "Something went wrong. Please try again.";
const INVALID = "This invite link is no longer valid. Ask the firm for a new one.";

async function openInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("staff_invites")
    .select("id, firm_id, email, role, attorney_id, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!data || data.accepted_at || data.revoked_at || new Date(data.expires_at) <= new Date()) return null;
  return data;
}

/** Emails a sign-in code to the invited address, for someone who already has an account. */
export async function sendInviteCode(input: { token: string }): Promise<{ ok: true } | Failure> {
  const invite = await openInvite(input.token);
  if (!invite) return fail(INVALID);
  const { error } = await (await createClient()).auth.signInWithOtp({ email: invite.email, options: { shouldCreateUser: false } });
  if (error?.status === 429) return fail("Too many attempts. Please wait a minute and try again.");
  if (error) {
    console.error("[invite] code request failed", { status: error.status, code: error.code });
    return fail("We couldn't send the code right now. Please try again shortly.");
  }
  return { ok: true };
}

const acceptSchema = z.object({
  token: z.string(),
  firstName: z.string().trim().min(1, "Enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100),
  password: z.string(),
  code: z.string().trim().regex(/^(\d{6,10})?$/, "Enter the code from your email."),
});

export async function acceptInvite(input: z.input<typeof acceptSchema>): Promise<Failure> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { token, firstName, lastName, password, code } = parsed.data;
  if (!newPasswordSchema.safeParse(password).success) return fail(PASSWORD_POLICY_ERROR);

  const invite = await openInvite(token);
  if (!invite) return fail(INVALID);
  const admin = createAdminClient();
  const supabase = await createClient();

  // Who is accepting?
  const { data: existing } = await admin.from("profiles").select("id").eq("email", invite.email).maybeSingle();
  let userId: string;
  let createdUser = false;
  if (existing) {
    const session = await getSessionAccount();
    if (session?.id !== existing.id) {
      if (!code) return fail("This email already has an account. Enter the code we email you to confirm it's yours.", true);
      const { error } = await supabase.auth.verifyOtp({ email: invite.email, token: code, type: "email" });
      if (error) return fail("That code is invalid or has expired. Use the code from the most recent email.", true);
    }
    const { data: membership } = await admin.from("firm_memberships").select("firm_id").eq("profile_id", existing.id).maybeSingle();
    if (membership) return fail("This account already belongs to a firm's staff.");
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: invite.email, password, email_confirm: true });
    if (error || !data.user) {
      console.error("[invite] account creation failed", { status: error?.status, code: error?.code });
      return fail(error?.code === "weak_password" ? PASSWORD_POLICY_ERROR : GENERIC);
    }
    userId = data.user.id;
    createdUser = true;
  }

  // Claim the invite. Only one acceptance can win.
  const { data: claimed } = await admin
    .from("staff_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", invite.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!claimed) {
    if (createdUser) await admin.auth.admin.deleteUser(userId);
    return fail(INVALID);
  }

  const { error: memberError } = await admin.from("firm_memberships").insert({ profile_id: userId, firm_id: invite.firm_id, role: invite.role });
  if (memberError) {
    await admin.from("staff_invites").update({ accepted_at: null, accepted_by: null }).eq("id", invite.id);
    if (createdUser) await admin.auth.admin.deleteUser(userId);
    return fail(memberError.code === "23505" ? "This account already belongs to a firm's staff." : GENERIC);
  }

  if (!createdUser) await admin.auth.admin.updateUserById(userId, { password });
  await admin.from("profiles").update({ first_name: firstName, last_name: lastName }).eq("id", userId);
  if (invite.attorney_id) {
    await admin.from("attorneys").update({ profile_id: userId }).eq("id", invite.attorney_id).eq("firm_id", invite.firm_id).is("profile_id", null);
  }
  await admin.from("audit_log").insert({
    firm_id: invite.firm_id,
    actor_id: userId,
    action: "staff.invite_accepted",
    entity: "staff_invites",
    entity_id: invite.id,
    details: { role: invite.role, new_account: createdUser },
  });

  // Start a staff session; MFA enrollment comes next.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
  if (signInError) redirect("/staff/login");
  redirect("/staff/mfa-setup");
}
