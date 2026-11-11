"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { getStaffContext, type StaffContext } from "@/lib/staff/queries";
import { notifyAttorneyToCheck, notifyReviewRequested, sendInviteEmail } from "@/lib/notify/events";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FirmRole, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "./queries";

/**
 * Firm settings actions. Partners and admins only, except an attorney editing their own
 * profile. Settings tables are written with the caller's own permissions (RLS); memberships,
 * invites and image uploads go through the service role after the checks here.
 */

type Failure = { ok: false; error: string };
export type FirmResult = { ok: true } | Failure;
const fail = (error: string): Failure => ({ ok: false, error });
const GENERIC = "Something went wrong. Please try again.";
const MANAGERS_ONLY = "Only partners and admins can change firm settings.";
const uuid = z.guid();
const INVITE_DAYS = 7;
const ROLES = ["attorney", "partner", "admin"] as const;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function managerContext(): Promise<StaffContext | null> {
  const ctx = await getStaffContext();
  return ctx.isManager ? ctx : null;
}

async function audit(ctx: StaffContext, action: string, entity: string, entityId: string, details: { [key: string]: Json } = {}) {
  await createAdminClient()
    .from("audit_log")
    .insert({ firm_id: ctx.firmId, actor_id: ctx.account.id, action, entity, entity_id: entityId, details });
}

const refresh = () => revalidatePath("/staff", "layout");
const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null);

/** "Family Law" → "family-law" */
function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "item"
  );
}

/** A slug not yet used in this firm's table: "family-law", then "family-law-2", and so on. */
async function freeSlug(table: "attorneys" | "consult_types", firmId: string, base: string, exceptId?: string) {
  const { data } = await (await createClient()).from(table).select("id, slug").eq("firm_id", firmId).like("slug", `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

// ---------------------------------------------------------------------------
// Firm profile and policies
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter the firm's name.").max(200),
  contactEmail: z.union([z.literal(""), z.email("Enter a valid contact email.").max(254)]),
  contactPhone: optional(40),
  cancellationCutoffHours: z.number({ error: "Enter the cutoff in whole hours." }).int("Enter the cutoff in whole hours.").min(0, "The cutoff can't be negative.").max(336, "The cutoff can be at most 336 hours (two weeks)."),
  agreementText: z.string().max(20000, "The agreement can be up to 20,000 characters."),
});

export async function saveFirmProfile(input: z.input<typeof profileSchema>): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const p = parsed.data;

  // Firms have no update policy for browser roles; the manager check above is the gate.
  const { data } = await createAdminClient()
    .from("firms")
    .update({
      name: p.name,
      contact_email: p.contactEmail.toLowerCase() || null,
      contact_phone: p.contactPhone,
      cancellation_cutoff_hours: p.cancellationCutoffHours,
      // Blank means the standard agreement.
      agreement_text: p.agreementText.trim() ? p.agreementText.replace(/\r\n/g, "\n") : null,
    })
    .eq("id", ctx.firmId)
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "firm.settings_saved", "firms", ctx.firmId, { cutoff_hours: p.cancellationCutoffHours, custom_agreement: Boolean(p.agreementText.trim()) });
  revalidatePath("/", "layout");
  return { ok: true };
}

export type ImageUploadResult = { ok: true; path: string; token: string } | Failure;

function checkImage(input: { size: number; mimeType: string }, maxBytes: number): string | null {
  if (!IMAGE_TYPES[input.mimeType]) return "Choose a JPEG, PNG or WebP image.";
  if (!(input.size > 0 && input.size <= maxBytes)) return `Choose an image of ${maxBytes / (1024 * 1024)} MB or less.`;
  return null;
}

export async function createLogoUpload(input: { size: number; mimeType: string }): Promise<ImageUploadResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const problem = checkImage(input, 1024 * 1024);
  if (problem) return fail(problem);
  const path = `${ctx.firmId}/${randomUUID()}.${IMAGE_TYPES[input.mimeType]}`;
  const { data, error } = await createAdminClient().storage.from("firm-logos").createSignedUploadUrl(path);
  if (error || !data) return fail(GENERIC);
  return { ok: true, path: data.path, token: data.token };
}

/** Points the firm at an uploaded logo (or none), and removes the previous file. */
export async function setFirmLogo(input: { path: string | null }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (input.path !== null && !new RegExp(`^${ctx.firmId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(input.path)) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: firm } = await admin.from("firms").select("logo_path").eq("id", ctx.firmId).single();
  const { error } = await admin.from("firms").update({ logo_path: input.path }).eq("id", ctx.firmId);
  if (error) return fail(GENERIC);
  if (firm?.logo_path && firm.logo_path !== input.path) await admin.storage.from("firm-logos").remove([firm.logo_path]);
  await audit(ctx, input.path ? "firm.logo_set" : "firm.logo_removed", "firms", ctx.firmId);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Consultation types
// ---------------------------------------------------------------------------

/** PayMongo's smallest checkout amount, in centavos. */
const MIN_PAID_CENTAVOS = 2000;

const consultSchema = z.object({
  id: z.union([z.literal(""), uuid]),
  label: z.string().trim().min(2, "Enter a name for the consultation.").max(100),
  description: z.string().trim().max(500),
  mode: z.enum(["phone", "video", "in_person"]),
  durationMinutes: z.number().int().min(15).max(240).refine((m) => m % 15 === 0, "Durations go in steps of 15 minutes."),
  pricePesos: z.string().trim().regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter the price in pesos, like 1500 or 1500.50."),
  isActive: z.boolean(),
});

export async function saveConsultType(input: z.input<typeof consultSchema>): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const parsed = consultSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const c = parsed.data;
  const priceCentavos = Math.round(Number(c.pricePesos) * 100);
  if (priceCentavos > 0 && priceCentavos < MIN_PAID_CENTAVOS) return fail("Paid consultations must cost at least ₱20, PayMongo's minimum.");

  const supabase = await createClient();
  const fields = {
    label: c.label,
    description: c.description,
    mode: c.mode,
    duration_minutes: c.durationMinutes,
    price_centavos: priceCentavos,
    is_active: c.isActive,
  };
  let id = c.id;
  if (id) {
    const { data } = await supabase.from("consult_types").update(fields).eq("id", id).eq("firm_id", ctx.firmId).select("id").maybeSingle();
    if (!data) return fail(GENERIC);
  } else {
    const { data: last } = await supabase
      .from("consult_types")
      .select("sort_order")
      .eq("firm_id", ctx.firmId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabase
      .from("consult_types")
      .insert({ ...fields, firm_id: ctx.firmId, slug: await freeSlug("consult_types", ctx.firmId, slugify(c.label)), sort_order: (last?.sort_order ?? 0) + 1 })
      .select("id")
      .single();
    if (error || !data) return fail(GENERIC);
    id = data.id;
  }
  await audit(ctx, c.id ? "consult_type.updated" : "consult_type.added", "consult_types", id, { price_centavos: priceCentavos, active: c.isActive });
  refresh();
  return { ok: true };
}

/** Moves a consultation type up or down the list clients choose from. */
export async function moveConsultType(input: { id: string; direction: "up" | "down" }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const supabase = await createClient();
  const { data } = await supabase.from("consult_types").select("id, sort_order").eq("firm_id", ctx.firmId).order("sort_order").order("label");
  const list = data ?? [];
  const i = list.findIndex((c) => c.id === input.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  // Renumber everything, so equal sort orders from earlier data can't keep two in place.
  for (const [n, c] of list.entries()) {
    if (c.sort_order !== n) await supabase.from("consult_types").update({ sort_order: n }).eq("id", c.id);
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Offices
// ---------------------------------------------------------------------------

const officeSchema = z.object({
  id: z.union([z.literal(""), uuid]),
  name: z.string().trim().min(2, "Enter the office's name.").max(100),
  address: z.string().trim().max(300),
  isRemote: z.boolean(),
});

export async function saveOffice(input: z.input<typeof officeSchema>): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const parsed = officeSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const o = parsed.data;
  if (!o.isRemote && !o.address) return fail("Enter the address clients should go to.");

  const supabase = await createClient();
  const fields = { name: o.name, address: o.address, is_remote: o.isRemote };
  const { data, error } = o.id
    ? await supabase.from("offices").update(fields).eq("id", o.id).eq("firm_id", ctx.firmId).select("id").maybeSingle()
    : await supabase.from("offices").insert({ ...fields, firm_id: ctx.firmId }).select("id").single();
  if (error?.code === "23505") return fail("Another office already has that name.");
  if (error || !data) return fail(GENERIC);
  await audit(ctx, o.id ? "office.updated" : "office.added", "offices", data.id, { name: o.name });
  refresh();
  return { ok: true };
}

/** Attorneys at a deleted office simply have no office afterwards. */
export async function deleteOffice(input: { id: string }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (!uuid.safeParse(input.id).success) return fail(GENERIC);
  const { data } = await (await createClient()).from("offices").delete().eq("id", input.id).eq("firm_id", ctx.firmId).select("id, name").maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "office.deleted", "offices", data.id, { name: data.name });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attorneys
// ---------------------------------------------------------------------------

const list = (max: number) =>
  z
    .array(z.string().trim().min(1).max(60))
    .max(max)
    .transform((items) => [...new Set(items)]);
const meetingUrl = z.union([z.literal(""), z.url({ protocol: /^https$/, error: "Enter a full https:// meeting link." }).max(500)]);

const attorneySchema = z.object({
  id: z.union([z.literal(""), uuid]),
  fullName: z.string().trim().min(2, "Enter the attorney's full name.").max(200),
  slug: z.union([z.literal(""), z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes in the page address.").max(60)]),
  ibpRollNo: optional(40),
  admittedYear: z.union([z.literal(""), z.string().regex(/^(19|20)\d{2}$/, "Enter the year admitted, like 2012.")]),
  practiceAreas: list(20),
  languages: list(20),
  officeId: z.union([z.literal(""), uuid]),
  bio: z.string().trim().max(5000),
  meetingUrl,
  isActive: z.boolean(),
});

export async function saveAttorney(input: z.input<typeof attorneySchema>): Promise<{ ok: true; id: string } | Failure> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const parsed = attorneySchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const a = parsed.data;
  if (a.admittedYear && Number(a.admittedYear) > new Date().getFullYear()) return fail("The year admitted can't be in the future.");

  const supabase = await createClient();
  const slug = await freeSlug("attorneys", ctx.firmId, a.slug || slugify(a.fullName), a.id || undefined);
  if (a.slug && slug !== a.slug) return fail("Another attorney already uses that page address.");
  const fields = {
    full_name: a.fullName,
    slug,
    ibp_roll_no: a.ibpRollNo,
    admitted_year: a.admittedYear ? Number(a.admittedYear) : null,
    practice_areas: a.practiceAreas,
    languages: a.languages,
    office_id: a.officeId || null,
    bio: a.bio,
    meeting_url: a.meetingUrl || null,
    is_active: a.isActive,
  };
  const { data, error } = a.id
    ? await supabase.from("attorneys").update(fields).eq("id", a.id).eq("firm_id", ctx.firmId).select("id").maybeSingle()
    : await supabase.from("attorneys").insert({ ...fields, firm_id: ctx.firmId }).select("id").single();
  if (error?.code === "23505") return fail("Another attorney already uses that page address.");
  if (error || !data) {
    if (error) console.error("[firm] attorney save failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  await audit(ctx, a.id ? "attorney.updated" : "attorney.added", "attorneys", data.id, { name: a.fullName, active: a.isActive });
  await notifyAttorneyToCheck(data.id);
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

const ownProfileSchema = z.object({ practiceAreas: list(20), languages: list(20), bio: z.string().trim().max(5000), meetingUrl });

/** An attorney's own public details. Credentials and status stay with partners and admins. */
export async function saveOwnAttorneyProfile(input: z.input<typeof ownProfileSchema>): Promise<FirmResult> {
  const ctx = await getStaffContext();
  if (!ctx.attorneyId) return fail("Your account isn't linked to an attorney profile.");
  const parsed = ownProfileSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const p = parsed.data;
  const { error } = await (await createClient()).rpc("update_own_attorney_profile", {
    p_bio: p.bio,
    p_practice_areas: p.practiceAreas,
    p_languages: p.languages,
    p_meeting_url: p.meetingUrl || null,
  });
  if (error) return fail(GENERIC);
  await audit(ctx, "attorney.updated_own_profile", "attorneys", ctx.attorneyId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Partners and admins can change any attorney's photo; an attorney their own. */
function canEditAttorney(ctx: StaffContext, attorneyId: string) {
  return ctx.attorneys.some((a) => a.id === attorneyId) && (ctx.isManager || ctx.attorneyId === attorneyId);
}

export async function createAttorneyPhotoUpload(input: { attorneyId: string; size: number; mimeType: string }): Promise<ImageUploadResult> {
  const ctx = await getStaffContext();
  if (!canEditAttorney(ctx, input.attorneyId)) return fail("You can only change your own photo.");
  const problem = checkImage(input, 2 * 1024 * 1024);
  if (problem) return fail(problem);
  const path = `${ctx.firmId}/${input.attorneyId}/${randomUUID()}.${IMAGE_TYPES[input.mimeType]}`;
  const { data, error } = await createAdminClient().storage.from("attorney-photos").createSignedUploadUrl(path);
  if (error || !data) return fail(GENERIC);
  return { ok: true, path: data.path, token: data.token };
}

export async function setAttorneyPhoto(input: { attorneyId: string; path: string | null }): Promise<FirmResult> {
  const ctx = await getStaffContext();
  if (!canEditAttorney(ctx, input.attorneyId)) return fail("You can only change your own photo.");
  const pattern = new RegExp(`^${ctx.firmId}/${input.attorneyId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  if (input.path !== null && !pattern.test(input.path)) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: attorney } = await admin.from("attorneys").select("photo_path").eq("id", input.attorneyId).eq("firm_id", ctx.firmId).single();
  const { error } = await admin.from("attorneys").update({ photo_path: input.path }).eq("id", input.attorneyId).eq("firm_id", ctx.firmId);
  if (error) return fail(GENERIC);
  if (attorney?.photo_path && attorney.photo_path !== input.path) await admin.storage.from("attorney-photos").remove([attorney.photo_path]);
  await audit(ctx, input.path ? "attorney.photo_set" : "attorney.photo_removed", "attorneys", input.attorneyId);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Links an attorney profile to a staff account (or unlinks it), so the account sees that attorney's matters. */
export async function linkAttorneyAccount(input: { attorneyId: string; profileId: string | null }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (!ctx.attorneys.some((a) => a.id === input.attorneyId)) return fail(GENERIC);
  const admin = createAdminClient();
  if (input.profileId) {
    const { data: member } = await admin.from("firm_memberships").select("profile_id").eq("profile_id", input.profileId).eq("firm_id", ctx.firmId).maybeSingle();
    if (!member) return fail("Choose a member of this firm.");
    const { data: other } = await admin.from("attorneys").select("id").eq("profile_id", input.profileId).neq("id", input.attorneyId).maybeSingle();
    if (other) return fail("That account is already linked to another attorney profile.");
  }
  const { error } = await admin.from("attorneys").update({ profile_id: input.profileId }).eq("id", input.attorneyId).eq("firm_id", ctx.firmId);
  if (error) return fail(GENERIC);
  await audit(ctx, input.profileId ? "attorney.account_linked" : "attorney.account_unlinked", "attorneys", input.attorneyId, { profile_id: input.profileId });
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Staff: invites, roles, removal
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  role: z.enum(ROLES),
  attorneyId: z.union([z.literal(""), uuid]),
});

/** Creates a one-time invite link, emails it and shows it once. Only its hash is stored. */
export async function createInvite(input: {
  email: string;
  role: FirmRole;
  attorneyId: string;
}): Promise<{ ok: true; link: string; emailed: boolean } | Failure> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  const parsed = inviteSchema.safeParse({ ...input, email: input.email.trim().toLowerCase() });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { email, role, attorneyId } = parsed.data;

  const admin = createAdminClient();
  if (attorneyId) {
    const { data: attorney } = await admin.from("attorneys").select("profile_id").eq("id", attorneyId).eq("firm_id", ctx.firmId).maybeSingle();
    if (!attorney) return fail(GENERIC);
    if (attorney.profile_id) return fail("That attorney profile is already linked to an account.");
  }
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile) {
    const { data: membership } = await admin.from("firm_memberships").select("firm_id").eq("profile_id", profile.id).maybeSingle();
    if (membership) {
      return fail(membership.firm_id === ctx.firmId ? "That person is already on your staff." : "That person already works for another firm on this platform.");
    }
  }

  // A new invite replaces any earlier one for the same email.
  await admin
    .from("staff_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("firm_id", ctx.firmId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("staff_invites")
    .insert({
      firm_id: ctx.firmId,
      email,
      role,
      attorney_id: attorneyId || null,
      token_hash: hashInviteToken(token),
      invited_by: ctx.account.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return fail(GENERIC);
  const link = `${publicEnv.NEXT_PUBLIC_SITE_URL}/staff/invite/${token}`;
  const { sent } = await sendInviteEmail({
    firmId: ctx.firmId,
    inviteId: data.id,
    to: email,
    inviterName: `${ctx.account.firstName} ${ctx.account.lastName}`.trim() || "Your firm",
    role,
    link,
    expiresAt,
  });
  await audit(ctx, "staff.invited", "staff_invites", data.id, { email, role, emailed: sent });
  revalidatePath("/staff/firm/staff");
  return { ok: true, link, emailed: sent };
}

export async function revokeInvite(input: { inviteId: string }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (!uuid.safeParse(input.inviteId).success) return fail(GENERIC);
  const { data } = await createAdminClient()
    .from("staff_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.inviteId)
    .eq("firm_id", ctx.firmId)
    .is("accepted_at", null)
    .select("id, email")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "staff.invite_revoked", "staff_invites", data.id, { email: data.email });
  revalidatePath("/staff/firm/staff");
  return { ok: true };
}

const MANAGER_ROLES: readonly FirmRole[] = ["partner", "admin"];

/** Would the firm still have a partner or admin after this person's role changes (null: removed)? */
async function keepsAManager(firmId: string, profileId: string, newRole: FirmRole | null): Promise<boolean> {
  const { data } = await createAdminClient().from("firm_memberships").select("profile_id, role").eq("firm_id", firmId);
  const rolesAfter = (data ?? []).map((m) => (m.profile_id === profileId ? newRole : m.role));
  return rolesAfter.some((role) => role !== null && MANAGER_ROLES.includes(role));
}

export async function changeMemberRole(input: { profileId: string; role: FirmRole }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (!uuid.safeParse(input.profileId).success || !ROLES.includes(input.role)) return fail(GENERIC);
  if (input.profileId === ctx.account.id) return fail("Ask another partner or admin to change your own role.");
  if (!(await keepsAManager(ctx.firmId, input.profileId, input.role))) return fail("The firm needs at least one partner or admin.");

  const { data } = await createAdminClient()
    .from("firm_memberships")
    .update({ role: input.role })
    .eq("profile_id", input.profileId)
    .eq("firm_id", ctx.firmId)
    .select("profile_id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "staff.role_changed", "firm_memberships", input.profileId, { role: input.role });
  refresh();
  return { ok: true };
}

/** Ends someone's staff access. Their attorney profile and past records stay with the firm. */
export async function removeMember(input: { profileId: string }): Promise<FirmResult> {
  const ctx = await managerContext();
  if (!ctx) return fail(MANAGERS_ONLY);
  if (!uuid.safeParse(input.profileId).success) return fail(GENERIC);
  if (input.profileId === ctx.account.id) return fail("You can't remove yourself. Ask another partner or admin.");
  if (!(await keepsAManager(ctx.firmId, input.profileId, null))) return fail("The firm needs at least one partner or admin.");

  const admin = createAdminClient();
  const { data } = await admin.from("firm_memberships").delete().eq("profile_id", input.profileId).eq("firm_id", ctx.firmId).select("profile_id").maybeSingle();
  if (!data) return fail(GENERIC);
  await admin.from("attorneys").update({ profile_id: null }).eq("profile_id", input.profileId).eq("firm_id", ctx.firmId);
  await audit(ctx, "staff.removed", "firm_memberships", input.profileId);
  refresh();
  return { ok: true };
}

/** A partner or admin of a pending firm asks for its booking page to go live. */
export async function requestFirmReview(): Promise<FirmResult> {
  const ctx = await getStaffContext();
  if (!ctx.isManager) return fail("Only partners and admins can do this.");
  const { data, error } = await (await createClient()).rpc("request_firm_review");
  if (error) {
    console.error("[firm] review request failed", { code: error.code, message: error.message });
    return fail("Something went wrong. Please try again.");
  }
  if (data === "incomplete") return fail("Finish the steps above first.");
  if (data === "not_pending") return fail("Your booking page is already live.");
  if (data !== "requested") return fail("Only partners and admins can do this.");
  await notifyReviewRequested(ctx.firmId);
  refresh();
  return { ok: true };
}
