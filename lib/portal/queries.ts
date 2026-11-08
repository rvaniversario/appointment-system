import "server-only";
import type { SessionAccount } from "@/lib/auth/session";
import { formatCalendarDate, formatDateLabel, formatPeso, formatTimeLabel, manilaDate } from "@/lib/booking/time";
import { createClient } from "@/lib/supabase/server";
import type {
  PortalAppointment,
  PortalContact,
  PortalDocument,
  PortalFirm,
  PortalInvoice,
  PortalMessage,
} from "./types";

/**
 * Reads for the client portal. They run with the signed-in user's own permissions (RLS), and
 * every query also filters to rows where they are the client: a staff member can be a client
 * of another firm, and RLS would otherwise also return their own firm's rows.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const HOUR_MS = 3_600_000;

export function whenLabel(instant: Date): string {
  return `${formatDateLabel(manilaDate(instant))} · ${formatTimeLabel(instant)}`;
}

/** Can the client still cancel or reschedule this appointment online? */
export function canClientChange(input: { status: string; startsAt: Date; cutoffHours: number; now?: Date }): boolean {
  const now = input.now ?? new Date();
  return input.status === "confirmed" && input.startsAt.getTime() - now.getTime() >= input.cutoffHours * HOUR_MS;
}

async function namesById(supabase: Supabase, table: "firms" | "attorneys", ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const column = table === "firms" ? "name" : "full_name";
  const { data } = await supabase.from(table).select(`id, ${column}`).in("id", ids);
  return new Map(
    ((data ?? []) as unknown as Record<string, string>[]).map((row) => [row.id, row[column]]),
  );
}

const unique = <T,>(values: (T | null | undefined)[]) => [...new Set(values.filter((v): v is T => v != null))];

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/** Every booking the client made, at any firm. Abandoned holds and checkouts are left out. */
export async function getPortalAppointments(account: SessionAccount): Promise<PortalAppointment[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("appointments")
    .select("id, firm_id, attorney_id, consult_type_id, starts_at, ends_at, status, meeting_url")
    .eq("client_id", account.id)
    .not("confirmed_at", "is", null)
    .order("starts_at", { ascending: true });
  const appointments = rows ?? [];
  if (!appointments.length) return [];

  const ids = appointments.map((a) => a.id);
  const [{ data: firms }, { data: attorneys }, { data: consultTypes }, { data: payments }] = await Promise.all([
    supabase.from("firms").select("id, name, cancellation_cutoff_hours").in("id", unique(appointments.map((a) => a.firm_id))),
    supabase.from("attorneys").select("id, full_name, office_id").in("id", unique(appointments.map((a) => a.attorney_id))),
    supabase.from("consult_types").select("id, label, mode").in("id", unique(appointments.map((a) => a.consult_type_id))),
    supabase.from("payments").select("appointment_id").eq("client_id", account.id).eq("status", "paid").in("appointment_id", ids),
  ]);
  const officeIds = unique((attorneys ?? []).map((a) => a.office_id));
  const { data: offices } = officeIds.length
    ? await supabase.from("offices").select("id, name, address").in("id", officeIds)
    : { data: [] };

  const firmById = new Map((firms ?? []).map((f) => [f.id, f]));
  const attorneyById = new Map((attorneys ?? []).map((a) => [a.id, a]));
  const consultById = new Map((consultTypes ?? []).map((c) => [c.id, c]));
  const officeById = new Map((offices ?? []).map((o) => [o.id, o]));
  const paidIds = new Set((payments ?? []).map((p) => p.appointment_id));
  const now = new Date();

  return appointments.map((a) => {
    const startsAt = new Date(a.starts_at);
    const firm = firmById.get(a.firm_id);
    const attorney = attorneyById.get(a.attorney_id);
    const consult = consultById.get(a.consult_type_id);
    const office = attorney?.office_id ? officeById.get(attorney.office_id) : undefined;
    const cutoffHours = firm?.cancellation_cutoff_hours ?? 24;
    const mode = consult?.mode ?? "video";
    return {
      id: a.id,
      firmName: firm?.name ?? "",
      attorneyName: attorney?.full_name ?? "",
      consultLabel: consult?.label ?? "Consultation",
      mode,
      startsAt: a.starts_at,
      whenLabel: whenLabel(startsAt),
      durationMinutes: Math.round((new Date(a.ends_at).getTime() - startsAt.getTime()) / 60_000),
      status: a.status,
      upcoming: new Date(a.ends_at) > now && a.status === "confirmed",
      meetingUrl: mode === "video" ? a.meeting_url : null,
      officeAddress: mode === "in_person" && office ? [office.name, office.address].filter(Boolean).join(", ") : null,
      canChange: canClientChange({ status: a.status, startsAt, cutoffHours, now }),
      cutoffHours,
      paid: paidIds.has(a.id),
    };
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Attorneys the client can message: anyone they've had a booking with, or already have a thread with. */
export async function getPortalContacts(account: SessionAccount): Promise<PortalContact[]> {
  const supabase = await createClient();
  const [{ data: booked }, { data: threads }] = await Promise.all([
    supabase.from("appointments").select("firm_id, attorney_id").eq("client_id", account.id).not("confirmed_at", "is", null),
    supabase.from("message_threads").select("id, firm_id, attorney_id").eq("client_id", account.id),
  ]);

  const contacts = new Map<string, { firmId: string; threadId: string | null }>();
  for (const b of booked ?? []) contacts.set(b.attorney_id, { firmId: b.firm_id, threadId: null });
  for (const t of threads ?? []) contacts.set(t.attorney_id, { firmId: t.firm_id, threadId: t.id });
  if (!contacts.size) return [];

  const threadIds = (threads ?? []).map((t) => t.id);
  const [firmNames, attorneyNames, { data: unreadRows }] = await Promise.all([
    namesById(supabase, "firms", unique([...contacts.values()].map((c) => c.firmId))),
    namesById(supabase, "attorneys", [...contacts.keys()]),
    threadIds.length
      ? supabase.from("messages").select("thread_id").in("thread_id", threadIds).neq("sender_id", account.id).is("read_at", null)
      : Promise.resolve({ data: [] as { thread_id: string }[] }),
  ]);
  const unread = new Map<string, number>();
  for (const row of unreadRows ?? []) unread.set(row.thread_id, (unread.get(row.thread_id) ?? 0) + 1);

  return [...contacts.entries()]
    .map(([attorneyId, c]) => ({
      attorneyId,
      attorneyName: attorneyNames.get(attorneyId) ?? "",
      firmName: firmNames.get(c.firmId) ?? "",
      threadId: c.threadId,
      unread: c.threadId ? (unread.get(c.threadId) ?? 0) : 0,
    }))
    .sort((a, b) => a.firmName.localeCompare(b.firmName) || a.attorneyName.localeCompare(b.attorneyName));
}

/** The latest messages in a thread, oldest first. */
export async function getThreadMessages(account: SessionAccount, threadId: string, limit = 200): Promise<PortalMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse().map((m) => {
    const sent = new Date(m.created_at);
    return {
      id: m.id,
      mine: m.sender_id === account.id,
      body: m.body,
      sentLabel: `${formatCalendarDate(sent).replace(/, \d{4}$/, "")}, ${formatTimeLabel(sent)}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getPortalDocuments(account: SessionAccount): Promise<PortalDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, firm_id, file_name, size_bytes, uploaded_by, created_at")
    .eq("owner_id", account.id)
    .order("created_at", { ascending: false });
  const firmNames = await namesById(supabase, "firms", unique((data ?? []).map((d) => d.firm_id)));
  return (data ?? []).map((d) => ({
    id: d.id,
    fileName: d.file_name,
    firmName: firmNames.get(d.firm_id) ?? "",
    addedLabel: formatCalendarDate(new Date(d.created_at)),
    sizeLabel: sizeLabel(d.size_bytes),
    fromFirm: d.uploaded_by !== account.id,
  }));
}

/** Firms the client has had a booking with, so can send documents to. */
export async function getClientFirms(account: SessionAccount): Promise<PortalFirm[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("firm_id")
    .eq("client_id", account.id)
    .not("confirmed_at", "is", null);
  const names = await namesById(supabase, "firms", unique((data ?? []).map((a) => a.firm_id)));
  return [...names.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function getPortalInvoices(account: SessionAccount): Promise<PortalInvoice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id, firm_id, description, amount_centavos, status, paid_at, due_date, created_at")
    .eq("client_id", account.id)
    .order("created_at", { ascending: false });
  const firmNames = await namesById(supabase, "firms", unique((data ?? []).map((i) => i.firm_id)));
  return (data ?? []).map((i) => ({
    id: i.id,
    description: i.description,
    firmName: firmNames.get(i.firm_id) ?? "",
    amountLabel: formatPeso(i.amount_centavos),
    dateLabel: formatCalendarDate(new Date(i.paid_at ?? i.due_date ?? i.created_at)),
    status: i.status,
  }));
}
