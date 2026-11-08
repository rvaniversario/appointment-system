import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { isManagerRole, requireStaff, type SessionAccount } from "@/lib/auth/session";
import {
  addDays,
  dayParts,
  formatCalendarDate,
  formatDateLabel,
  formatPeso,
  formatTimeLabel,
  isDateString,
  manilaDate,
  weekdayOf,
} from "@/lib/booking/time";
import { createClient } from "@/lib/supabase/server";
import type {
  AppointmentDetail,
  CalendarDay,
  CalendarEntry,
  ConflictPartyView,
  FeeRow,
  LoadBar,
  QueueItem,
  StaffAttorney,
  StaffThread,
  StatCard,
  TimeOff,
  WeeklyHour,
} from "./types";

/**
 * Reads for the staff dashboard. Everything runs with the signed-in staff member's own
 * permissions, so RLS decides what they see: an attorney sees their own matters, a partner or
 * admin sees the whole firm. Queries also filter to the firm, because a staff member can be a
 * client of another firm.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface StaffContext {
  account: SessionAccount;
  firmId: string;
  isManager: boolean;
  /** The attorney profile linked to this account, if any. */
  attorneyId: string | null;
  attorneys: StaffAttorney[];
}

export const getStaffContext = cache(async (): Promise<StaffContext> => {
  const account = await requireStaff();
  const firmId = account.firmId as string;
  const supabase = await createClient();
  const { data } = await supabase
    .from("attorneys")
    .select("id, full_name, is_active, practice_areas, profile_id")
    .eq("firm_id", firmId)
    .order("full_name");
  const rows = data ?? [];
  return {
    account,
    firmId,
    isManager: isManagerRole(account.role),
    attorneyId: rows.find((a) => a.profile_id === account.id)?.id ?? null,
    attorneys: rows.map((a) => ({ id: a.id, name: a.full_name, isActive: a.is_active, practiceAreas: a.practice_areas })),
  };
});

const unique = <T,>(values: (T | null | undefined)[]) => [...new Set(values.filter((v): v is T => v != null))];
const whenLabel = (instant: Date) => `${formatDateLabel(manilaDate(instant))} · ${formatTimeLabel(instant)}`;
const dayStart = (date: string) => new Date(`${date}T00:00:00+08:00`);

/** Client names as they gave them at intake, keyed by appointment. */
async function intakeNames(supabase: Supabase, appointmentIds: string[]) {
  if (!appointmentIds.length) return new Map<string, { name: string; caseType: string; urgency: "standard" | "urgent" }>();
  const { data } = await supabase
    .from("intakes")
    .select("appointment_id, first_name, last_name, case_type, urgency")
    .in("appointment_id", appointmentIds);
  return new Map(
    (data ?? []).map((i) => [i.appointment_id, { name: `${i.first_name} ${i.last_name}`, caseType: i.case_type, urgency: i.urgency }]),
  );
}

async function consultLabels(supabase: Supabase, ids: string[]) {
  if (!ids.length) return new Map<string, { label: string; mode: string }>();
  const { data } = await supabase.from("consult_types").select("id, label, mode").in("id", ids);
  return new Map((data ?? []).map((c) => [c.id, { label: c.label, mode: c.mode }]));
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/** The Monday of the week containing this Manila date. */
export function weekStartOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export async function getCalendarWeek(ctx: StaffContext, requested?: string) {
  const today = manilaDate(new Date());
  const start = weekStartOf(requested && isDateString(requested) ? requested : today);
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, ...dayParts(date), isToday: date === today };
  });

  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, attorney_id, consult_type_id, starts_at, status, review_status")
    .eq("firm_id", ctx.firmId)
    .not("confirmed_at", "is", null)
    .in("status", ["confirmed", "completed", "no_show"])
    .gte("starts_at", dayStart(start).toISOString())
    .lt("starts_at", dayStart(addDays(start, 7)).toISOString())
    .order("starts_at");
  const rows = data ?? [];
  const [names, consults] = await Promise.all([
    intakeNames(supabase, rows.map((r) => r.id)),
    consultLabels(supabase, unique(rows.map((r) => r.consult_type_id))),
  ]);

  const entries = new Map<string, CalendarEntry[]>();
  for (const r of rows) {
    const startsAt = new Date(r.starts_at);
    const key = `${r.attorney_id}|${manilaDate(startsAt)}`;
    const list = entries.get(key) ?? [];
    list.push({
      id: r.id,
      attorneyId: r.attorney_id,
      timeLabel: formatTimeLabel(startsAt),
      clientName: names.get(r.id)?.name ?? "Client",
      consultLabel: consults.get(r.consult_type_id)?.label ?? "Consultation",
      status: r.status,
      reviewStatus: r.review_status,
    });
    entries.set(key, list);
  }

  // Attorneys see their own row; partners and admins see every active attorney.
  const attorneys = ctx.isManager
    ? ctx.attorneys.filter((a) => a.isActive || rows.some((r) => r.attorney_id === a.id))
    : ctx.attorneys.filter((a) => a.id === ctx.attorneyId);

  return {
    days,
    attorneys,
    entries: Object.fromEntries(entries),
    previousWeek: addDays(start, -7),
    nextWeek: addDays(start, 7),
    thisWeek: weekStartOf(today),
    rangeLabel: `${formatDateLabel(start)} – ${formatDateLabel(addDays(start, 6))}`,
  };
}

// ---------------------------------------------------------------------------
// Intake queue
// ---------------------------------------------------------------------------

/** Confirmed bookings no one has reviewed yet, soonest first. */
export async function getQueue(ctx: StaffContext): Promise<QueueItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, attorney_id, consult_type_id, starts_at, price_centavos")
    .eq("firm_id", ctx.firmId)
    .eq("status", "confirmed")
    .eq("review_status", "pending")
    .gte("ends_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("starts_at")
    .limit(200);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const [names, consults, { data: hits }] = await Promise.all([
    intakeNames(supabase, ids),
    consultLabels(supabase, unique(rows.map((r) => r.consult_type_id))),
    ids.length ? supabase.from("conflict_hits").select("appointment_id").in("appointment_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const hitCount = new Map<string, number>();
  for (const h of hits ?? []) hitCount.set(h.appointment_id, (hitCount.get(h.appointment_id) ?? 0) + 1);
  const attorneyName = new Map(ctx.attorneys.map((a) => [a.id, a.name]));

  return rows.map((r) => {
    const intake = names.get(r.id);
    return {
      id: r.id,
      clientName: intake?.name ?? "Client",
      caseType: intake?.caseType ?? "",
      urgency: intake?.urgency ?? "standard",
      attorneyName: attorneyName.get(r.attorney_id) ?? "",
      whenLabel: whenLabel(new Date(r.starts_at)),
      consultLabel: consults.get(r.consult_type_id)?.label ?? "Consultation",
      conflictCount: hitCount.get(r.id) ?? 0,
      paid: r.price_centavos > 0,
    };
  });
}

export async function getQueueCount(ctx: StaffContext): Promise<number> {
  const { count } = await (await createClient())
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", ctx.firmId)
    .eq("status", "confirmed")
    .eq("review_status", "pending")
    .gte("ends_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// One appointment
// ---------------------------------------------------------------------------

export async function getAppointmentDetail(ctx: StaffContext, appointmentId: string): Promise<AppointmentDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("appointments")
    .select("id, client_id, attorney_id, consult_type_id, starts_at, ends_at, status, review_status, cancel_reason, meeting_url, confirmed_at")
    .eq("id", appointmentId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!a || !a.confirmed_at) notFound();

  const [{ data: intake }, consults, { data: hits }, { data: agreement }, { data: payment }, { data: docs }] = await Promise.all([
    supabase
      .from("intakes")
      .select("first_name, last_name, email, phone, case_type, urgency, details, opposing_party, sms_opt_in")
      .eq("appointment_id", a.id)
      .maybeSingle(),
    consultLabels(supabase, [a.consult_type_id]),
    supabase.from("conflict_hits").select("conflict_party_id, matched_name, similarity").eq("appointment_id", a.id),
    supabase.from("agreements").select("signature_name, signed_at, version").eq("appointment_id", a.id).maybeSingle(),
    // Payments are visible to partners and admins only; attorneys get nothing back.
    supabase.from("payments").select("amount_centavos, status").eq("appointment_id", a.id).in("status", ["paid", "refunded"]).limit(1).maybeSingle(),
    a.client_id
      ? supabase
          .from("documents")
          .select("id, file_name, size_bytes, uploaded_by, created_at")
          .eq("firm_id", ctx.firmId)
          .eq("owner_id", a.client_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const partyIds = unique((hits ?? []).map((h) => h.conflict_party_id));
  const { data: parties } = partyIds.length
    ? await supabase.from("conflict_parties").select("id, name, matter, attorney_id").in("id", partyIds)
    : { data: [] };
  const partyById = new Map((parties ?? []).map((p) => [p.id, p]));
  const attorneyName = new Map(ctx.attorneys.map((x) => [x.id, x.name]));
  const consult = consults.get(a.consult_type_id);
  const startsAt = new Date(a.starts_at);
  const caseType = intake?.case_type ?? "";

  return {
    id: a.id,
    clientId: a.client_id,
    attorneyId: a.attorney_id,
    attorneyName: attorneyName.get(a.attorney_id) ?? "",
    consultLabel: consult?.label ?? "Consultation",
    mode: (consult?.mode ?? "video") as AppointmentDetail["mode"],
    whenLabel: whenLabel(startsAt),
    durationMinutes: Math.round((new Date(a.ends_at).getTime() - startsAt.getTime()) / 60_000),
    status: a.status,
    reviewStatus: a.review_status,
    cancelReason: a.cancel_reason,
    meetingUrl: a.meeting_url,
    started: startsAt <= new Date(),
    intake: intake
      ? {
          name: `${intake.first_name} ${intake.last_name}`,
          email: intake.email,
          phone: intake.phone,
          caseType: intake.case_type,
          urgency: intake.urgency,
          details: intake.details,
          opposingParty: intake.opposing_party,
          smsOptIn: intake.sms_opt_in,
        }
      : null,
    conflicts: (hits ?? [])
      .map((h) => {
        const party = partyById.get(h.conflict_party_id);
        return {
          partyName: party?.name ?? h.matched_name,
          matter: party?.matter ?? "",
          matchedName: h.matched_name,
          score: Math.round(Number(h.similarity) * 100),
          attorneyName: party?.attorney_id ? (attorneyName.get(party.attorney_id) ?? null) : null,
        };
      })
      .sort((x, y) => y.score - x.score),
    documents: (docs ?? []).map((d) => ({
      id: d.id,
      fileName: d.file_name,
      addedLabel: formatCalendarDate(new Date(d.created_at)),
      sizeLabel: sizeLabel(d.size_bytes),
      fromFirm: d.uploaded_by !== a.client_id,
    })),
    agreement: agreement
      ? { signatureName: agreement.signature_name, signedLabel: whenLabel(new Date(agreement.signed_at)), version: agreement.version }
      : null,
    payment: payment ? { amountLabel: formatPeso(payment.amount_centavos), status: payment.status } : null,
    reassignOptions: ctx.attorneys
      .filter((x) => x.isActive && x.id !== a.attorney_id)
      .map((x) => ({ id: x.id, name: x.name, matchesCaseType: Boolean(caseType) && x.practiceAreas.includes(caseType) }))
      .sort((x, y) => Number(y.matchesCaseType) - Number(x.matchesCaseType) || x.name.localeCompare(y.name)),
  };
}

// ---------------------------------------------------------------------------
// Conflict database
// ---------------------------------------------------------------------------

export async function searchConflicts(ctx: StaffContext, query: string): Promise<ConflictPartyView[]> {
  const supabase = await createClient();
  const attorneyName = new Map(ctx.attorneys.map((a) => [a.id, a.name]));
  const q = query.trim().slice(0, 100);
  const { data } = q
    ? await supabase.rpc("search_conflict_parties", { p_query: q })
    : await supabase
        .from("conflict_parties")
        .select("id, name, matter, attorney_id")
        .eq("firm_id", ctx.firmId)
        .order("created_at", { ascending: false })
        .limit(50);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    matter: p.matter,
    attorneyName: (p.attorney_id && attorneyName.get(p.attorney_id)) || "",
  }));
}

// ---------------------------------------------------------------------------
// Analytics and fees
// ---------------------------------------------------------------------------

/** "2026-11" for the current Manila month, or the requested one if valid. */
export function monthOf(requested?: string): { month: string; start: string; end: string; label: string; previous: string; next: string } {
  const month = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : manilaDate(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const previous = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
  return { month, start, end: `${nextMonth}-01`, label, previous, next: nextMonth };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export async function getAnalytics(ctx: StaffContext, requestedMonth?: string) {
  const period = monthOf(requestedMonth);
  const from = dayStart(period.start).toISOString();
  const to = dayStart(period.end).toISOString();
  const supabase = await createClient();

  const [{ data: booked }, { count: attempts }, { data: payments }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, attorney_id, starts_at, created_at, status, confirmed_at")
      .eq("firm_id", ctx.firmId)
      .not("confirmed_at", "is", null)
      .gte("starts_at", from)
      .lt("starts_at", to),
    // Every booking started in the month, finished or not.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("firm_id", ctx.firmId)
      .gte("created_at", from)
      .lt("created_at", to),
    ctx.isManager
      ? supabase
          .from("payments")
          .select("amount_centavos, refunded_centavos, status, created_at")
          .eq("firm_id", ctx.firmId)
          .in("status", ["paid", "refunded"])
          .gte("created_at", from)
          .lt("created_at", to)
      : Promise.resolve({ data: null }),
  ]);
  const rows = booked ?? [];
  const live = rows.filter((r) => r.status !== "canceled");
  const completed = rows.filter((r) => r.status === "completed").length;
  const noShows = rows.filter((r) => r.status === "no_show").length;
  const canceled = rows.length - live.length;
  const { count: confirmedStarted } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", ctx.firmId)
    .not("confirmed_at", "is", null)
    .gte("created_at", from)
    .lt("created_at", to);
  const leadDays = live.map((r) => (new Date(r.starts_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000);
  const avgLead = leadDays.length ? leadDays.reduce((s, d) => s + d, 0) / leadDays.length : null;

  const cards: StatCard[] = [
    { label: ctx.isManager ? "Bookings" : "Your bookings", value: String(live.length), hint: `${canceled} canceled` },
    { label: "No-show rate", value: pct(noShows, completed + noShows), hint: `${completed} completed, ${noShows} missed` },
    { label: "Bookings finished", value: pct(confirmedStarted ?? 0, attempts ?? 0), hint: "Of bookings started online" },
    { label: "Avg. time to consult", value: avgLead == null ? "—" : `${avgLead.toFixed(1)} days`, hint: "From booking to start" },
  ];
  if (payments) {
    const collected = payments.reduce((s, p) => s + p.amount_centavos - p.refunded_centavos, 0);
    cards.push({ label: "Fees collected online", value: formatPeso(collected), hint: "Net of refunds" });
  }

  // Partners see load by attorney; an attorney sees their own load by week.
  let bars: { name: string; count: number }[];
  if (ctx.isManager) {
    bars = ctx.attorneys
      .map((a) => ({ name: a.name, count: live.filter((r) => r.attorney_id === a.id).length }))
      .filter((b, i) => b.count > 0 || ctx.attorneys[i].isActive);
  } else {
    bars = [];
    for (let w = period.start; w < period.end; w = addDays(w, 7)) {
      const end = addDays(w, 7) < period.end ? addDays(w, 7) : period.end;
      const count = live.filter((r) => {
        const d = manilaDate(new Date(r.starts_at));
        return d >= w && d < end;
      }).length;
      bars.push({ name: `${formatDateLabel(w).slice(5)} – ${formatDateLabel(addDays(end, -1)).slice(5)}`, count });
    }
  }
  const max = Math.max(1, ...bars.map((b) => b.count));
  const load: LoadBar[] = bars.map((b) => ({ ...b, barPct: Math.round((b.count / max) * 100) }));

  return { period, cards, load, loadHeading: ctx.isManager ? "Consultations by attorney" : "Your consultations by week" };
}

/** Online fees per attorney for a month. Partners and admins only (payments RLS). */
export async function getFeesByAttorney(ctx: StaffContext, requestedMonth?: string): Promise<{ label: string; rows: FeeRow[] }> {
  const period = monthOf(requestedMonth);
  const supabase = await createClient();
  const { data: payments } = await supabase
    .from("payments")
    .select("appointment_id, amount_centavos, refunded_centavos")
    .eq("firm_id", ctx.firmId)
    .in("status", ["paid", "refunded"])
    .gte("created_at", dayStart(period.start).toISOString())
    .lt("created_at", dayStart(period.end).toISOString());
  const ids = unique((payments ?? []).map((p) => p.appointment_id));
  const { data: appointments } = ids.length
    ? await supabase.from("appointments").select("id, attorney_id").in("id", ids)
    : { data: [] };
  const attorneyOf = new Map((appointments ?? []).map((a) => [a.id, a.attorney_id]));

  const totals = new Map<string, { consults: number; centavos: number }>();
  for (const p of payments ?? []) {
    const attorneyId = (p.appointment_id && attorneyOf.get(p.appointment_id)) || "";
    const t = totals.get(attorneyId) ?? { consults: 0, centavos: 0 };
    t.consults++;
    t.centavos += p.amount_centavos - p.refunded_centavos;
    totals.set(attorneyId, t);
  }
  const name = new Map(ctx.attorneys.map((a) => [a.id, a.name]));
  return {
    label: period.label,
    rows: [...totals.entries()]
      .map(([id, t]) => ({ attorneyName: name.get(id) ?? "Unassigned", consults: t.consults, collectedLabel: formatPeso(t.centavos) }))
      .sort((a, b) => a.attorneyName.localeCompare(b.attorneyName)),
  };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getStaffThreads(ctx: StaffContext): Promise<StaffThread[]> {
  // Attorneys see their own conversations; partners and admins see the whole firm's.
  if (!ctx.isManager && !ctx.attorneyId) return [];
  const supabase = await createClient();
  let query = supabase.from("message_threads").select("id, client_id, attorney_id").eq("firm_id", ctx.firmId);
  if (!ctx.isManager && ctx.attorneyId) query = query.eq("attorney_id", ctx.attorneyId);
  const { data: threads } = await query;
  const list = threads ?? [];
  if (!list.length) return [];

  const threadIds = list.map((t) => t.id);
  const [{ data: profiles }, { data: messages }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email").in("id", unique(list.map((t) => t.client_id))),
    supabase
      .from("messages")
      .select("thread_id, sender_id, read_at, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  const clientName = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email]),
  );
  const attorneyName = new Map(ctx.attorneys.map((a) => [a.id, a.name]));

  return list
    .map((t) => {
      const own = (messages ?? []).filter((m) => m.thread_id === t.id);
      const last = own[0];
      return {
        threadId: t.id,
        clientName: clientName.get(t.client_id) ?? "Client",
        attorneyName: attorneyName.get(t.attorney_id) ?? "",
        unread: own.filter((m) => m.sender_id === t.client_id && !m.read_at).length,
        lastLabel: last ? whenLabel(new Date(last.created_at)) : "",
        lastAt: last?.created_at ?? "",
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export async function getStaffThreadMessages(ctx: StaffContext, threadId: string) {
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("message_threads")
    .select("id, client_id")
    .eq("id", threadId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!thread) return null;
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).reverse().map((m) => ({
    id: m.id,
    // Anyone at the firm writing in the thread speaks for the firm.
    mine: m.sender_id !== thread.client_id,
    body: m.body,
    sentLabel: whenLabel(new Date(m.created_at)),
  }));
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/** Attorneys whose hours this person may edit: their own, or anyone's for partners and admins. */
export function editableAttorneys(ctx: StaffContext): StaffAttorney[] {
  return ctx.isManager ? ctx.attorneys : ctx.attorneys.filter((a) => a.id === ctx.attorneyId);
}

export async function getSchedule(attorneyId: string): Promise<{ hours: WeeklyHour[]; timeOff: TimeOff[] }> {
  const supabase = await createClient();
  const [{ data: rules }, { data: exceptions }] = await Promise.all([
    supabase.from("availability_rules").select("weekday, start_time, end_time").eq("attorney_id", attorneyId).order("weekday").order("start_time"),
    supabase
      .from("availability_exceptions")
      .select("id, starts_at, ends_at, reason")
      .eq("attorney_id", attorneyId)
      .gt("ends_at", new Date().toISOString())
      .order("starts_at"),
  ]);
  return {
    hours: (rules ?? []).map((r) => ({ weekday: r.weekday, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) })),
    timeOff: (exceptions ?? []).map((e) => {
      const s = new Date(e.starts_at);
      const end = new Date(e.ends_at);
      return { id: e.id, label: `${whenLabel(s)} to ${whenLabel(end)}`, reason: e.reason };
    }),
  };
}
