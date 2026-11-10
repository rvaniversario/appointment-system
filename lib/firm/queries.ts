import "server-only";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getSessionAccount } from "@/lib/auth/session";
import { formatCalendarDate, formatPeso, manilaDate } from "@/lib/booking/time";
import { publicEnv } from "@/lib/env";
import { getStaffContext, type StaffContext } from "@/lib/staff/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  AttorneyAdminView,
  ConsultTypeView,
  FirmProfileView,
  InviteLookup,
  InviteView,
  MemberView,
  OfficeView,
} from "./types";

/**
 * Reads for firm settings. They use the staff member's own permissions (RLS); the pages are
 * for partners and admins, except an attorney's own profile.
 */

/** Firm settings are for partners and admins. */
export async function requireManagerContext(): Promise<StaffContext> {
  const ctx = await getStaffContext();
  if (!ctx.isManager) redirect("/staff/calendar");
  return ctx;
}

export const publicImageUrl = (bucket: "attorney-photos" | "firm-logos", path: string | null) =>
  path ? `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` : null;

export const hashInviteToken = (token: string) => createHash("sha256").update(token).digest("hex");

const pesosOf = (centavos: number) => (centavos % 100 === 0 ? String(centavos / 100) : (centavos / 100).toFixed(2));

export async function getFirmProfile(ctx: StaffContext): Promise<FirmProfileView> {
  const { data } = await (await createClient())
    .from("firms")
    .select("name, slug, contact_email, contact_phone, logo_path, agreement_text, cancellation_cutoff_hours")
    .eq("id", ctx.firmId)
    .single();
  return {
    name: data?.name ?? "",
    slug: data?.slug ?? "",
    contactEmail: data?.contact_email ?? "",
    contactPhone: data?.contact_phone ?? "",
    logoUrl: publicImageUrl("firm-logos", data?.logo_path ?? null),
    agreementText: data?.agreement_text ?? "",
    cancellationCutoffHours: data?.cancellation_cutoff_hours ?? 24,
  };
}

export async function getFirmConsultTypes(ctx: StaffContext): Promise<ConsultTypeView[]> {
  const supabase = await createClient();
  const [{ data }, { data: used }] = await Promise.all([
    supabase
      .from("consult_types")
      .select("id, label, description, mode, duration_minutes, price_centavos, is_active, sort_order")
      .eq("firm_id", ctx.firmId)
      .order("sort_order")
      .order("label"),
    supabase.from("appointments").select("consult_type_id").eq("firm_id", ctx.firmId).limit(5000),
  ]);
  const inUse = new Set((used ?? []).map((a) => a.consult_type_id));
  return (data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    mode: c.mode,
    durationMinutes: c.duration_minutes,
    pricePesos: pesosOf(c.price_centavos),
    priceLabel: c.price_centavos === 0 ? "Free" : formatPeso(c.price_centavos),
    isActive: c.is_active,
    inUse: inUse.has(c.id),
  }));
}

export async function getFirmOffices(ctx: StaffContext): Promise<OfficeView[]> {
  const supabase = await createClient();
  const [{ data }, { data: attorneys }] = await Promise.all([
    supabase.from("offices").select("id, name, address, is_remote").eq("firm_id", ctx.firmId).order("name"),
    supabase.from("attorneys").select("office_id").eq("firm_id", ctx.firmId),
  ]);
  return (data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    address: o.address,
    isRemote: o.is_remote,
    attorneyCount: (attorneys ?? []).filter((a) => a.office_id === o.id).length,
  }));
}

export async function getFirmMembers(ctx: StaffContext): Promise<MemberView[]> {
  const supabase = await createClient();
  const { data: memberships } = await supabase.from("firm_memberships").select("profile_id, role").eq("firm_id", ctx.firmId);
  const ids = (memberships ?? []).map((m) => m.profile_id);
  const [{ data: profiles }, { data: attorneys }] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, email, first_name, last_name").in("id", ids) : Promise.resolve({ data: [] }),
    supabase.from("attorneys").select("full_name, profile_id").eq("firm_id", ctx.firmId).not("profile_id", "is", null),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const attorneyOf = new Map((attorneys ?? []).map((a) => [a.profile_id, a.full_name]));
  const ORDER = { admin: 0, partner: 1, attorney: 2 } as const;
  return (memberships ?? [])
    .map((m) => {
      const p = profileById.get(m.profile_id);
      return {
        profileId: m.profile_id,
        name: [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.email || "Staff member",
        email: p?.email ?? "",
        role: m.role,
        attorneyName: attorneyOf.get(m.profile_id) ?? null,
        isYou: m.profile_id === ctx.account.id,
      };
    })
    .sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
}

export async function getOpenInvites(ctx: StaffContext): Promise<InviteView[]> {
  const { data } = await (await createClient())
    .from("staff_invites")
    .select("id, email, role, attorney_id, created_at, expires_at")
    .eq("firm_id", ctx.firmId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const attorneyName = new Map(ctx.attorneys.map((a) => [a.id, a.name]));
  const now = new Date();
  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    attorneyId: i.attorney_id,
    attorneyName: (i.attorney_id && attorneyName.get(i.attorney_id)) || null,
    invitedLabel: formatCalendarDate(new Date(i.created_at)),
    expiresLabel: formatCalendarDate(new Date(i.expires_at)),
    expired: new Date(i.expires_at) <= now,
  }));
}

export async function getFirmAttorneys(ctx: StaffContext): Promise<AttorneyAdminView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attorneys")
    .select("id, slug, full_name, ibp_roll_no, admitted_year, practice_areas, languages, office_id, bio, meeting_url, is_active, photo_path, profile_id")
    .eq("firm_id", ctx.firmId)
    .order("full_name");
  const memberIds = (data ?? []).map((a) => a.profile_id).filter((id): id is string => Boolean(id));
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, email, first_name, last_name").in("id", memberIds)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]));
  return (data ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    fullName: a.full_name,
    ibpRollNo: a.ibp_roll_no ?? "",
    admittedYear: a.admitted_year ? String(a.admitted_year) : "",
    practiceAreas: a.practice_areas,
    languages: a.languages,
    officeId: a.office_id ?? "",
    bio: a.bio,
    meetingUrl: a.meeting_url ?? "",
    isActive: a.is_active,
    photoUrl: publicImageUrl("attorney-photos", a.photo_path),
    memberId: a.profile_id,
    memberName: a.profile_id ? (nameOf.get(a.profile_id) ?? null) : null,
  }));
}

// ---------------------------------------------------------------------------
// Invite links (public: the visitor holding the link isn't staff yet)
// ---------------------------------------------------------------------------

/** What the holder of an invite link may see: the firm, the role and the invited email. */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { state: "invalid" };
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("staff_invites")
    .select("firm_id, email, role, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!invite || invite.revoked_at) return { state: "invalid" };
  if (invite.accepted_at) return { state: "used" };
  if (new Date(invite.expires_at) <= new Date()) return { state: "expired" };

  const [{ data: firm }, { data: profile }, session] = await Promise.all([
    admin.from("firms").select("name").eq("id", invite.firm_id).single(),
    admin.from("profiles").select("id").eq("email", invite.email).maybeSingle(),
    getSessionAccount(),
  ]);
  return {
    state: "open",
    firmName: firm?.name ?? "",
    email: invite.email,
    role: invite.role,
    hasAccount: Boolean(profile),
    signedInAsInvitee: Boolean(session && profile && session.id === profile.id),
  };
}

/** Texts the firm has sent this month (Philippine time) and its monthly limit. */
export async function getSmsUsage(ctx: StaffContext): Promise<{ sent: number; cap: number }> {
  const supabase = await createClient();
  const month = `${manilaDate(new Date()).slice(0, 7)}-01`;
  const [{ data: firm }, { data: usage }] = await Promise.all([
    supabase.from("firms").select("sms_monthly_cap").eq("id", ctx.firmId).single(),
    supabase.from("sms_usage").select("sent").eq("firm_id", ctx.firmId).eq("month", month).maybeSingle(),
  ]);
  return { sent: usage?.sent ?? 0, cap: firm?.sms_monthly_cap ?? 0 };
}

export interface FirmLaunchState {
  slug: string;
  status: "pending" | "active" | "suspended";
  reviewRequested: boolean;
  steps: { attorney: boolean; consult: boolean; hours: boolean; contact: boolean };
}

/** Whether the firm's booking page is live, and if not, what's left before it can ask for review. */
export async function getFirmLaunchState(ctx: StaffContext): Promise<FirmLaunchState> {
  const supabase = await createClient();
  const [{ data: firm }, { data: setup }] = await Promise.all([
    supabase.from("firms").select("slug, status, review_requested_at").eq("id", ctx.firmId).single(),
    supabase.rpc("firm_setup_status", { p_firm: ctx.firmId }),
  ]);
  const s = setup?.[0];
  return {
    slug: firm?.slug ?? "",
    status: firm?.status ?? "pending",
    reviewRequested: Boolean(firm?.review_requested_at),
    steps: { attorney: Boolean(s?.attorney_ready), consult: Boolean(s?.consult_ready), hours: Boolean(s?.hours_ready), contact: Boolean(s?.contact_ready) },
  };
}
