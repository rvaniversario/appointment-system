"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, isDateString } from "@/lib/booking/time";
import { ALLOWED_DOCUMENT_TYPES, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, safeFileName } from "@/lib/documents/rules";
import { notifyApproved, notifyCanceled, notifyMeetingLink, notifyMessage, notifyReassigned } from "@/lib/notify/events";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { editableAttorneys, getStaffContext, type StaffContext } from "./queries";

/**
 * Staff dashboard actions. Changes are written with the staff member's own permissions, so
 * RLS enforces the same rules as the pages: an attorney acts on their own matters, a partner
 * or admin on the whole firm's. The service role is used only for the audit log and for
 * steps no browser role may take (creating threads, writing to a client's document folder).
 */

type Failure = { ok: false; error: string };
export type StaffResult = { ok: true } | Failure;
const fail = (error: string): Failure => ({ ok: false, error });
const GENERIC = "Something went wrong. Please try again.";
const NOT_FOUND = "We couldn't find that appointment.";
const uuid = z.guid();

async function audit(ctx: StaffContext, action: string, entity: string, entityId: string, details: { [key: string]: Json } = {}) {
  await createAdminClient()
    .from("audit_log")
    .insert({ firm_id: ctx.firmId, actor_id: ctx.account.id, action, entity, entity_id: entityId, details });
}

/** An appointment this staff member can see. RLS returns only their own unless they manage the firm. */
async function visibleAppointment(ctx: StaffContext, appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return null;
  const { data } = await (await createClient())
    .from("appointments")
    .select("id, attorney_id, client_id, consult_type_id, starts_at, status, review_status, meeting_url, confirmed_at")
    .eq("id", appointmentId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  return data?.confirmed_at ? data : null;
}

const refresh = (appointmentId?: string) => {
  revalidatePath("/staff", "layout");
  if (appointmentId) revalidatePath(`/staff/appointments/${appointmentId}`);
};

// ---------------------------------------------------------------------------
// Review: approve, decline, reassign
// ---------------------------------------------------------------------------

export async function approveAppointment(input: { appointmentId: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt) return fail(NOT_FOUND);
  if (appt.status !== "confirmed") return fail("Only confirmed bookings can be approved.");

  const { data } = await (await createClient())
    .from("appointments")
    .update({ review_status: "approved" })
    .eq("id", appt.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "appointment.approved", "appointments", appt.id);
  if (appt.review_status !== "approved") await notifyApproved(appt.id);
  refresh(appt.id);
  return { ok: true };
}

/** Turns the booking down. A paid one shows on Billing as a refund due. */
export async function declineAppointment(input: { appointmentId: string; reason: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt) return fail(NOT_FOUND);
  if (appt.status !== "confirmed") return fail("Only confirmed bookings can be declined.");
  const reason = input.reason.trim().slice(0, 500);

  const { data } = await (await createClient())
    .from("appointments")
    .update({ status: "canceled", review_status: "declined", canceled_at: new Date().toISOString(), cancel_reason: "declined by firm" })
    .eq("id", appt.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "appointment.declined", "appointments", appt.id, { reason });
  await notifyCanceled(appt.id, "firm");
  refresh(appt.id);
  return { ok: true };
}

/** Moves a booking to another attorney at the same time. Partners and admins only. */
export async function reassignAppointment(input: { appointmentId: string; attorneyId: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  if (!ctx.isManager) return fail("Only partners and admins can reassign bookings.");
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt) return fail(NOT_FOUND);
  if (appt.status !== "confirmed") return fail("Only confirmed bookings can be reassigned.");
  const target = ctx.attorneys.find((a) => a.id === input.attorneyId && a.isActive);
  if (!target || target.id === appt.attorney_id) return fail("Choose another active attorney.");

  const supabase = await createClient();
  const [{ data: consult }, { data: attorneys }] = await Promise.all([
    supabase.from("consult_types").select("mode").eq("id", appt.consult_type_id).maybeSingle(),
    supabase.from("attorneys").select("id, meeting_url").in("id", [appt.attorney_id, target.id]),
  ]);
  const meetingOf = new Map((attorneys ?? []).map((a) => [a.id, a.meeting_url]));
  // A video call on the old attorney's standing link moves to the new attorney's.
  const keepsLink = appt.meeting_url && appt.meeting_url !== meetingOf.get(appt.attorney_id);
  const meetingUrl = consult?.mode === "video" && !keepsLink ? (meetingOf.get(target.id) ?? null) : appt.meeting_url;

  const { data, error } = await supabase
    .from("appointments")
    .update({ attorney_id: target.id, review_status: "approved", meeting_url: meetingUrl })
    .eq("id", appt.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (error?.code === "23P01") return fail(`${target.name} already has a booking at that time.`);
  if (error || !data) {
    if (error) console.error("[staff] reassign failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  await audit(ctx, "appointment.reassigned", "appointments", appt.id, { from: appt.attorney_id, to: target.id });
  await notifyReassigned(appt.id, appt.attorney_id);
  refresh(appt.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Meeting link and outcome
// ---------------------------------------------------------------------------

const meetingUrlSchema = z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)]);

export async function setMeetingUrl(input: { appointmentId: string; url: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt) return fail(NOT_FOUND);
  const parsed = meetingUrlSchema.safeParse(input.url.trim());
  if (!parsed.success) return fail("Enter a full https:// link, such as a Zoom or Google Meet link.");

  const { data } = await (await createClient())
    .from("appointments")
    .update({ meeting_url: parsed.data || null })
    .eq("id", appt.id)
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "appointment.meeting_link_set", "appointments", appt.id, { cleared: !parsed.data });
  if (parsed.data && parsed.data !== appt.meeting_url && appt.status === "confirmed") await notifyMeetingLink(appt.id);
  refresh(appt.id);
  return { ok: true };
}

/** Records how a consultation went, once it has started. */
export async function recordOutcome(input: { appointmentId: string; outcome: "completed" | "no_show" }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt) return fail(NOT_FOUND);
  if (!["completed", "no_show"].includes(input.outcome)) return fail(GENERIC);
  if (!["confirmed", "completed", "no_show"].includes(appt.status)) return fail("This booking was canceled.");
  if (new Date(appt.starts_at) > new Date()) return fail("You can record the outcome once the consultation has started.");

  const { data } = await (await createClient())
    .from("appointments")
    .update({ status: input.outcome })
    .eq("id", appt.id)
    .in("status", ["confirmed", "completed", "no_show"])
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, `appointment.${input.outcome}`, "appointments", appt.id);
  refresh(appt.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Opens (or reuses) the conversation between a booking's client and its attorney. */
export async function startThread(input: { appointmentId: string }): Promise<{ ok: true; threadId: string } | Failure> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt?.client_id) return fail(NOT_FOUND);
  const { data, error } = await createAdminClient()
    .from("message_threads")
    .upsert({ firm_id: ctx.firmId, client_id: appt.client_id, attorney_id: appt.attorney_id }, { onConflict: "client_id,attorney_id" })
    .select("id")
    .single();
  if (error || !data) return fail(GENERIC);
  return { ok: true, threadId: data.id };
}

const messageSchema = z.object({ threadId: uuid, body: z.string().trim().min(1).max(5000) });

export async function sendStaffMessage(input: { threadId: string; body: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(input.body?.trim() ? "Messages can be up to 5,000 characters." : "Type a message first.");

  // RLS allows the thread's attorney and the firm's partners and admins.
  const { data: sent, error } = await (await createClient())
    .from("messages")
    .insert({ thread_id: parsed.data.threadId, sender_id: ctx.account.id, body: parsed.data.body })
    .select("id")
    .single();
  if (error || !sent) {
    console.error("[staff] message insert failed", { code: error?.code, message: error?.message });
    return fail("Your message wasn't sent. Please try again.");
  }
  await notifyMessage(sent.id);
  revalidatePath("/staff/messages");
  return { ok: true };
}

export async function markStaffThreadRead(input: { threadId: string }): Promise<StaffResult> {
  await getStaffContext();
  if (!uuid.safeParse(input.threadId).success) return fail(GENERIC);
  const { error } = await (await createClient()).rpc("mark_thread_read", { p_thread: input.threadId });
  return error ? fail(GENERIC) : { ok: true };
}

// ---------------------------------------------------------------------------
// Conflict database
// ---------------------------------------------------------------------------

const partySchema = z.object({
  name: z.string().trim().min(2).max(200),
  matter: z.string().trim().min(2).max(300),
  attorneyId: z.union([z.literal(""), uuid]),
});

export async function addConflictParty(input: { name: string; matter: string; attorneyId: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  if (!ctx.isManager) return fail("Only partners and admins can change the conflict database.");
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) return fail("Enter the party's name and the matter.");
  if (parsed.data.attorneyId && !ctx.attorneys.some((a) => a.id === parsed.data.attorneyId)) return fail(GENERIC);

  const { data, error } = await (await createClient())
    .from("conflict_parties")
    .insert({ firm_id: ctx.firmId, name: parsed.data.name, matter: parsed.data.matter, attorney_id: parsed.data.attorneyId || null })
    .select("id")
    .single();
  if (error || !data) return fail(GENERIC);
  await audit(ctx, "conflict_party.added", "conflict_parties", data.id, { name: parsed.data.name });
  revalidatePath("/staff/conflicts");
  return { ok: true };
}

export async function removeConflictParty(input: { partyId: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  if (!ctx.isManager) return fail("Only partners and admins can change the conflict database.");
  if (!uuid.safeParse(input.partyId).success) return fail(GENERIC);
  const { data } = await (await createClient())
    .from("conflict_parties")
    .delete()
    .eq("id", input.partyId)
    .eq("firm_id", ctx.firmId)
    .select("id, name")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "conflict_party.removed", "conflict_parties", data.id, { name: data.name });
  revalidatePath("/staff/conflicts");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hoursSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), startTime: timeSchema, endTime: timeSchema }))
  .max(50);

function canEditSchedule(ctx: StaffContext, attorneyId: string) {
  return editableAttorneys(ctx).some((a) => a.id === attorneyId);
}

export async function saveWeeklyHours(input: {
  attorneyId: string;
  hours: { weekday: number; startTime: string; endTime: string }[];
}): Promise<StaffResult> {
  const ctx = await getStaffContext();
  if (!canEditSchedule(ctx, input.attorneyId)) return fail("You can only change your own hours.");
  const parsed = hoursSchema.safeParse(input.hours);
  if (!parsed.success) return fail("Enter times like 09:00.");
  const hours = parsed.data;

  for (const h of hours) if (h.endTime <= h.startTime) return fail("Each block must end after it starts.");
  for (let day = 0; day < 7; day++) {
    const blocks = hours.filter((h) => h.weekday === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < blocks.length; i++) {
      if (blocks[i].startTime < blocks[i - 1].endTime) return fail("Blocks on the same day can't overlap.");
    }
  }

  const { error } = await (await createClient()).rpc("replace_weekly_hours", {
    p_attorney: input.attorneyId,
    p_hours: hours.map((h) => ({ weekday: h.weekday, start_time: h.startTime, end_time: h.endTime })),
  });
  if (error) {
    console.error("[staff] hours save failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  await audit(ctx, "availability.hours_saved", "attorneys", input.attorneyId, { blocks: hours.length });
  revalidatePath("/staff/availability");
  return { ok: true };
}

/** Blocks whole days, in Manila time. Existing bookings in that time are kept. */
export async function addTimeOff(input: {
  attorneyId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}): Promise<{ ok: true; overlapping: number } | Failure> {
  const ctx = await getStaffContext();
  if (!canEditSchedule(ctx, input.attorneyId)) return fail("You can only change your own time off.");
  if (!isDateString(input.fromDate) || !isDateString(input.toDate) || input.toDate < input.fromDate) {
    return fail("Choose a start date and an end date on or after it.");
  }
  const startsAt = new Date(`${input.fromDate}T00:00:00+08:00`).toISOString();
  const endsAt = new Date(`${addDays(input.toDate, 1)}T00:00:00+08:00`).toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_exceptions")
    .insert({ attorney_id: input.attorneyId, starts_at: startsAt, ends_at: endsAt, reason: input.reason.trim().slice(0, 200) })
    .select("id")
    .single();
  if (error || !data) return fail(GENERIC);

  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("attorney_id", input.attorneyId)
    .eq("status", "confirmed")
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);
  await audit(ctx, "availability.time_off_added", "attorneys", input.attorneyId, { from: input.fromDate, to: input.toDate });
  revalidatePath("/staff/availability");
  return { ok: true, overlapping: count ?? 0 };
}

export async function removeTimeOff(input: { attorneyId: string; timeOffId: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  if (!canEditSchedule(ctx, input.attorneyId) || !uuid.safeParse(input.timeOffId).success) return fail(GENERIC);
  const { data } = await (await createClient())
    .from("availability_exceptions")
    .delete()
    .eq("id", input.timeOffId)
    .eq("attorney_id", input.attorneyId)
    .select("id")
    .maybeSingle();
  if (!data) return fail(GENERIC);
  await audit(ctx, "availability.time_off_removed", "attorneys", input.attorneyId);
  revalidatePath("/staff/availability");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type StaffUploadUrlResult = { ok: true; path: string; token: string } | Failure;

/** A one-time URL for adding a document to a client's file at this firm. */
export async function createStaffDocumentUpload(input: {
  appointmentId: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<StaffUploadUrlResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt?.client_id) return fail(NOT_FOUND);
  if (!ALLOWED_DOCUMENT_TYPES.has(input.mimeType)) return fail("Upload a PDF, Word document (.docx), JPG or PNG.");
  if (!(input.size > 0 && input.size <= MAX_DOCUMENT_BYTES)) return fail("Files must be 10 MB or smaller.");

  const path = `${ctx.firmId}/${appt.client_id}/${randomUUID()}-${safeFileName(input.fileName)}`;
  const { data, error } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(GENERIC);
  return { ok: true, path: data.path, token: data.token };
}

export async function confirmStaffDocumentUpload(input: { appointmentId: string; path: string; fileName: string }): Promise<StaffResult> {
  const ctx = await getStaffContext();
  const appt = await visibleAppointment(ctx, input.appointmentId);
  if (!appt?.client_id) return fail(NOT_FOUND);
  if (!input.path.startsWith(`${ctx.firmId}/${appt.client_id}/`) || input.path.includes("..")) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: info } = await admin.storage.from(DOCUMENTS_BUCKET).info(input.path);
  if (!info) return fail("We couldn't find that upload. Please try again.");
  const { data, error } = await admin
    .from("documents")
    .insert({
      firm_id: ctx.firmId,
      owner_id: appt.client_id,
      appointment_id: appt.id,
      storage_path: input.path,
      file_name: input.fileName.slice(0, 200) || "document",
      mime_type: info.contentType ?? "application/octet-stream",
      size_bytes: info.size ?? 0,
      uploaded_by: ctx.account.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([input.path]);
    return fail(GENERIC);
  }
  await audit(ctx, "document.added_by_staff", "documents", data.id, { appointment_id: appt.id });
  refresh(appt.id);
  return { ok: true };
}

/** A short-lived link to a document the staff member may see (RLS on table and storage). */
export async function getStaffDocumentUrl(input: { documentId: string }): Promise<{ ok: true; url: string } | Failure> {
  const ctx = await getStaffContext();
  if (!uuid.safeParse(input.documentId).success) return fail(GENERIC);
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, file_name")
    .eq("id", input.documentId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!doc) return fail("We couldn't find that document.");
  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return fail(GENERIC);
  await audit(ctx, "document.downloaded", "documents", doc.id);
  return { ok: true, url: data.signedUrl };
}
