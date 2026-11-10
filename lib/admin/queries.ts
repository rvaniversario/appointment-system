import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FirmRole, FirmStatus, Json } from "@/lib/supabase/database.types";

/*
 * Reads for the operator area. They use the service role, so every caller must have passed
 * requireOperator(). They select firm-level columns only: no bookings, intakes, messages,
 * documents or payments, and only the audit entries listed in FIRM_EVENTS, which carry no
 * client data.
 */

export type FirmStage = "review" | "setup" | "live" | "suspended";

export interface AdminFirmRow {
  id: string;
  slug: string;
  name: string;
  status: FirmStatus;
  stage: FirmStage;
  createdAt: string;
  reviewRequestedAt: string | null;
  comped: boolean;
  compedUntil: string | null;
  attorneys: number;
  /** Active attorneys with a roll number and year who haven't been checked. */
  toCheck: number;
  staff: number;
}

export interface AdminAttorney {
  id: string;
  name: string;
  slug: string;
  rollNo: string;
  admittedYear: number | null;
  isActive: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  hasAccount: boolean;
}

export interface AdminFirmEvent {
  at: string;
  action: string;
  label: string;
  actor: string | null;
  note: string | null;
}

export interface AdminFirmDetail {
  id: string;
  slug: string;
  name: string;
  status: FirmStatus;
  stage: FirmStage;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  reviewRequestedAt: string | null;
  signer: { name: string; email: string } | null;
  comped: boolean;
  compedUntil: string | null;
  compNote: string | null;
  firmNote: string | null;
  approvedAt: string | null;
  steps: { attorney: boolean; consult: boolean; hours: boolean; contact: boolean };
  attorneys: AdminAttorney[];
  staff: { name: string; email: string; role: FirmRole }[];
  events: AdminFirmEvent[];
}

/** The audit entries operators see, with how to describe them. */
export const FIRM_EVENTS: Record<string, string> = {
  "firm.signed_up": "Signed up",
  "firm.review_requested": "Asked to go live",
  "platform.firm_approved": "Approved",
  "platform.firm_sent_back": "Sent back",
  "platform.firm_suspended": "Suspended",
  "platform.firm_reinstated": "Reinstated",
  "platform.attorney_checked": "Attorney checked",
  "platform.attorney_unchecked": "Attorney check removed",
  "platform.comp_set": "Comped",
  "platform.comp_ended": "Comp ended",
};
const EVENT_ACTIONS = Object.keys(FIRM_EVENTS);

const stageOf = (status: FirmStatus, reviewRequestedAt: string | null): FirmStage =>
  status === "active" ? "live" : status === "suspended" ? "suspended" : reviewRequestedAt ? "review" : "setup";

const needsCheck = (a: { is_active: boolean; ibp_checked_at: string | null; ibp_roll_no: string | null; admitted_year: number | null }) =>
  a.is_active && !a.ibp_checked_at && Boolean(a.ibp_roll_no) && a.admitted_year !== null;

const fullName = (p: { first_name: string; last_name: string; email: string }) =>
  [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;

async function profilesById(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, { name: string; email: string }>();
  const { data } = await createAdminClient().from("profiles").select("id, first_name, last_name, email").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, { name: fullName(p), email: p.email }]));
}

/** Every firm, the ones waiting on us first. Fine at our scale; paginate past a few hundred firms. */
export async function listAdminFirms(): Promise<AdminFirmRow[]> {
  const admin = createAdminClient();
  const [{ data: firms, error }, { data: platform }, { data: attorneys }, { data: members }] = await Promise.all([
    admin.from("firms").select("id, slug, name, status, created_at, review_requested_at").order("created_at", { ascending: false }),
    admin.from("firm_platform").select("firm_id, comped, comped_until"),
    admin.from("attorneys").select("firm_id, is_active, ibp_checked_at, ibp_roll_no, admitted_year"),
    admin.from("firm_memberships").select("firm_id"),
  ]);
  if (error) throw new Error(error.message);
  const comp = new Map((platform ?? []).map((p) => [p.firm_id, p]));
  const count = <T extends { firm_id: string }>(rows: T[] | null, firmId: string, ok: (r: T) => boolean = () => true) =>
    (rows ?? []).filter((r) => r.firm_id === firmId && ok(r)).length;

  const order: Record<FirmStage, number> = { review: 0, live: 1, setup: 2, suspended: 3 };
  return (firms ?? [])
    .map((f): AdminFirmRow => ({
      id: f.id,
      slug: f.slug,
      name: f.name,
      status: f.status,
      stage: stageOf(f.status, f.review_requested_at),
      createdAt: f.created_at,
      reviewRequestedAt: f.review_requested_at,
      comped: comp.get(f.id)?.comped ?? false,
      compedUntil: comp.get(f.id)?.comped_until ?? null,
      attorneys: count(attorneys, f.id, (a) => a.is_active),
      toCheck: count(attorneys, f.id, needsCheck),
      staff: count(members, f.id),
    }))
    .sort((a, b) => {
      // Waiting for review first (oldest request first), then live firms with attorneys to check.
      if (order[a.stage] !== order[b.stage]) return order[a.stage] - order[b.stage];
      if (a.stage === "review") return (a.reviewRequestedAt ?? "").localeCompare(b.reviewRequestedAt ?? "");
      return Number(b.toCheck > 0) - Number(a.toCheck > 0) || b.createdAt.localeCompare(a.createdAt);
    });
}

const noteOf = (details: Json): string | null =>
  details && typeof details === "object" && !Array.isArray(details) && typeof details.note === "string" ? details.note : null;

function describe(action: string, details: Json): string {
  const d = details && typeof details === "object" && !Array.isArray(details) ? details : {};
  if (action.startsWith("platform.attorney_") && typeof d.name === "string") return `${FIRM_EVENTS[action]}: ${d.name}`;
  if (action === "platform.comp_set") return typeof d.until === "string" ? `Comped until ${d.until}` : "Comped with no end date";
  return FIRM_EVENTS[action] ?? action;
}

export async function getAdminFirm(firmId: string): Promise<AdminFirmDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(firmId)) return null;
  const admin = createAdminClient();
  const { data: firm } = await admin
    .from("firms")
    .select("id, slug, name, status, contact_email, contact_phone, created_at, review_requested_at, created_by")
    .eq("id", firmId)
    .maybeSingle();
  if (!firm) return null;

  const [{ data: platform }, { data: setup }, { data: attorneys }, { data: members }, { data: events }] = await Promise.all([
    admin.from("firm_platform").select("comped, comped_until, comp_note, firm_note, approved_at").eq("firm_id", firmId).maybeSingle(),
    admin.rpc("firm_setup_status", { p_firm: firmId }),
    admin
      .from("attorneys")
      .select("id, full_name, slug, ibp_roll_no, admitted_year, is_active, ibp_checked_at, ibp_checked_by, profile_id")
      .eq("firm_id", firmId)
      .order("full_name"),
    admin.from("firm_memberships").select("profile_id, role").eq("firm_id", firmId),
    admin
      .from("audit_log")
      .select("action, actor_id, details, created_at")
      .eq("firm_id", firmId)
      .in("action", EVENT_ACTIONS)
      .order("id", { ascending: false })
      .limit(100),
  ]);

  const people = await profilesById([
    ...(firm.created_by ? [firm.created_by] : []),
    ...(attorneys ?? []).flatMap((a) => (a.ibp_checked_by ? [a.ibp_checked_by] : [])),
    ...(members ?? []).map((m) => m.profile_id),
    ...(events ?? []).flatMap((e) => (e.actor_id ? [e.actor_id] : [])),
  ]);
  const s = setup?.[0];

  return {
    id: firm.id,
    slug: firm.slug,
    name: firm.name,
    status: firm.status,
    stage: stageOf(firm.status, firm.review_requested_at),
    contactEmail: firm.contact_email,
    contactPhone: firm.contact_phone,
    createdAt: firm.created_at,
    reviewRequestedAt: firm.review_requested_at,
    signer: firm.created_by ? (people.get(firm.created_by) ?? null) : null,
    comped: platform?.comped ?? false,
    compedUntil: platform?.comped_until ?? null,
    compNote: platform?.comp_note ?? null,
    firmNote: platform?.firm_note ?? null,
    approvedAt: platform?.approved_at ?? null,
    steps: { attorney: Boolean(s?.attorney_ready), consult: Boolean(s?.consult_ready), hours: Boolean(s?.hours_ready), contact: Boolean(s?.contact_ready) },
    attorneys: (attorneys ?? []).map((a) => ({
      id: a.id,
      name: a.full_name,
      slug: a.slug,
      rollNo: a.ibp_roll_no ?? "",
      admittedYear: a.admitted_year,
      isActive: a.is_active,
      checkedAt: a.ibp_checked_at,
      checkedBy: a.ibp_checked_by ? (people.get(a.ibp_checked_by)?.name ?? null) : null,
      hasAccount: Boolean(a.profile_id),
    })),
    staff: (members ?? [])
      .map((m) => ({ name: people.get(m.profile_id)?.name ?? "", email: people.get(m.profile_id)?.email ?? "", role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    events: (events ?? []).map((e) => ({
      at: e.created_at,
      action: e.action,
      label: describe(e.action, e.details),
      actor: e.actor_id ? (people.get(e.actor_id)?.name ?? null) : null,
      note: noteOf(e.details),
    })),
  };
}

export interface PlatformAuditEntry extends AdminFirmEvent {
  firmId: string | null;
  firmName: string | null;
}

/** Recent operator actions across all firms. */
export async function listPlatformAudit(limit = 200): Promise<PlatformAuditEntry[]> {
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("audit_log")
    .select("firm_id, action, actor_id, details, created_at")
    .like("action", "platform.%")
    .order("id", { ascending: false })
    .limit(limit);
  const firmIds = [...new Set((events ?? []).flatMap((e) => (e.firm_id ? [e.firm_id] : [])))];
  const [{ data: firms }, people] = await Promise.all([
    firmIds.length ? admin.from("firms").select("id, name").in("id", firmIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    profilesById((events ?? []).flatMap((e) => (e.actor_id ? [e.actor_id] : []))),
  ]);
  const firmName = new Map((firms ?? []).map((f) => [f.id, f.name]));
  return (events ?? []).map((e) => ({
    at: e.created_at,
    action: e.action,
    label: describe(e.action, e.details),
    actor: e.actor_id ? (people.get(e.actor_id)?.name ?? null) : null,
    note: noteOf(e.details),
    firmId: e.firm_id,
    firmName: e.firm_id ? (firmName.get(e.firm_id) ?? null) : null,
  }));
}
