"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionAccount, type SessionAccount } from "@/lib/auth/session";
import { bookingWindow, getAvailability, getSlotPage, releaseLapsedHolds, type SlotPageData } from "@/lib/booking/queries";
import { isDateString, manilaDate } from "@/lib/booking/time";
import { ALLOWED_DOCUMENT_TYPES, DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, safeFileName } from "@/lib/documents/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { canClientChange } from "./queries";

/**
 * Client portal actions. Each one checks that the signed-in user is the client on the row,
 * using their own permissions (RLS), before any change made with the service role.
 */

type Failure = { ok: false; error: string };
export type PortalResult = { ok: true } | Failure;
const fail = (error: string): Failure => ({ ok: false, error });

const SIGNED_OUT = "Your session has ended. Please sign in again.";
const GENERIC = "Something went wrong. Please try again.";
const NOT_FOUND = "We couldn't find that appointment.";
const uuid = z.guid();

/** Documents one client may keep at one firm through the portal. */
const MAX_PORTAL_DOCUMENTS = 100;

async function audit(account: SessionAccount, firmId: string, action: string, entity: string, entityId: string, details: { [key: string]: Json }) {
  await createAdminClient()
    .from("audit_log")
    .insert({ firm_id: firmId, actor_id: account.id, action, entity, entity_id: entityId, details });
}

/** The client's own appointment, read with their permissions. */
async function ownAppointment(account: SessionAccount, appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointments")
    .select("id, firm_id, attorney_id, starts_at, ends_at, status")
    .eq("id", appointmentId)
    .eq("client_id", account.id)
    .not("confirmed_at", "is", null)
    .maybeSingle();
  if (!data) return null;
  const { data: firm } = await supabase.from("firms").select("cancellation_cutoff_hours").eq("id", data.firm_id).maybeSingle();
  const cutoffHours = firm?.cancellation_cutoff_hours ?? 24;
  return { ...data, cutoffHours, canChange: canClientChange({ status: data.status, startsAt: new Date(data.starts_at), cutoffHours }) };
}

const tooLate = (hours: number) =>
  `Online changes close ${hours} hour${hours === 1 ? "" : "s"} before the appointment. Please contact the firm.`;

// ---------------------------------------------------------------------------
// Cancel and reschedule
// ---------------------------------------------------------------------------

/** Cancels a confirmed booking. A paid one shows on the firm's Billing page as a refund due. */
export async function cancelAppointment(input: { appointmentId: string }): Promise<PortalResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  const appointment = await ownAppointment(account, input.appointmentId);
  if (!appointment) return fail(NOT_FOUND);
  if (!appointment.canChange) {
    return fail(appointment.status === "confirmed" ? tooLate(appointment.cutoffHours) : "This appointment can't be canceled.");
  }

  const { data, error } = await createAdminClient()
    .from("appointments")
    .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "canceled by client" })
    .eq("id", appointment.id)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[portal] cancel failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }

  await audit(account, appointment.firm_id, "appointment.canceled_by_client", "appointments", appointment.id, {
    starts_at: appointment.starts_at,
  });
  revalidatePath("/portal/appointments");
  return { ok: true };
}

export type RescheduleSlotsResult = ({ ok: true } & SlotPageData) | Failure;

/** Open times with the same attorney, for a consultation of the same length. */
export async function loadRescheduleSlots(input: { appointmentId: string; fromDate?: string }): Promise<RescheduleSlotsResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  const appointment = await ownAppointment(account, input.appointmentId);
  if (!appointment) return fail(NOT_FOUND);
  if (!appointment.canChange) return fail(tooLate(appointment.cutoffHours));

  const page = await getSlotPage({
    attorneyId: appointment.attorney_id,
    durationMinutes: durationOf(appointment),
    fromDate: input.fromDate && isDateString(input.fromDate) ? input.fromDate : undefined,
    // Its own time shouldn't block the times around it.
    ignoreAppointmentId: appointment.id,
  });
  return { ok: true, ...page };
}

const durationOf = (a: { starts_at: string; ends_at: string }) =>
  Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000);

export async function rescheduleAppointment(input: { appointmentId: string; startsAt: string }): Promise<PortalResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  const appointment = await ownAppointment(account, input.appointmentId);
  if (!appointment) return fail(NOT_FOUND);
  if (!appointment.canChange) return fail(tooLate(appointment.cutoffHours));

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return fail("Choose a new time.");
  const duration = durationOf(appointment);
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  // Only times the client could actually see are accepted.
  const [day] = await getAvailability({
    attorneyId: appointment.attorney_id,
    durationMinutes: duration,
    fromDate: manilaDate(startsAt),
    days: 1,
    ignoreAppointmentId: appointment.id,
  });
  if (day.date > bookingWindow().lastDate || !day.slots.some((s) => s.startsAt === startsAt.toISOString())) {
    return fail("That time was just taken. Please choose another.");
  }

  await releaseLapsedHolds(appointment.attorney_id, startsAt, endsAt);
  const { data, error } = await createAdminClient()
    .from("appointments")
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", appointment.id)
    .eq("status", "confirmed")
    // Unchanged since it was checked, so two tabs can't both move it.
    .eq("starts_at", appointment.starts_at)
    .select("id")
    .maybeSingle();
  if (error?.code === "23P01") return fail("That time was just taken. Please choose another.");
  if (error || !data) {
    if (error) console.error("[portal] reschedule failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }

  await audit(account, appointment.firm_id, "appointment.rescheduled_by_client", "appointments", appointment.id, {
    from: appointment.starts_at,
    to: startsAt.toISOString(),
  });
  revalidatePath("/portal/appointments");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const messageSchema = z.object({ attorneyId: uuid, body: z.string().trim().min(1).max(5000) });

/**
 * Sends a message to an attorney the client has booked with. The thread is created on the
 * first message; the message itself is written with the client's own permissions.
 */
export async function sendMessage(input: { attorneyId: string; body: string }): Promise<PortalResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return fail(input.body?.trim() ? "Messages can be up to 5,000 characters." : "Type a message first.");
  const { attorneyId, body } = parsed.data;

  const supabase = await createClient();
  const [{ data: thread }, { data: booking }] = await Promise.all([
    supabase.from("message_threads").select("id").eq("client_id", account.id).eq("attorney_id", attorneyId).maybeSingle(),
    supabase
      .from("appointments")
      .select("firm_id")
      .eq("client_id", account.id)
      .eq("attorney_id", attorneyId)
      .not("confirmed_at", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  let threadId = thread?.id ?? null;
  if (!threadId) {
    if (!booking) return fail("You can message attorneys you've booked a consultation with.");
    const { data: created, error } = await createAdminClient()
      .from("message_threads")
      .upsert({ firm_id: booking.firm_id, client_id: account.id, attorney_id: attorneyId }, { onConflict: "client_id,attorney_id" })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[portal] thread create failed", { code: error?.code, message: error?.message });
      return fail(GENERIC);
    }
    threadId = created.id;
  }

  const { error } = await supabase.from("messages").insert({ thread_id: threadId, sender_id: account.id, body });
  if (error) {
    console.error("[portal] message insert failed", { code: error.code, message: error.message });
    return fail("Your message wasn't sent. Please try again.");
  }
  revalidatePath("/portal/messages");
  return { ok: true };
}

export async function markThreadRead(input: { threadId: string }): Promise<PortalResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  if (!uuid.safeParse(input.threadId).success) return fail(GENERIC);
  const { error } = await (await createClient()).rpc("mark_thread_read", { p_thread: input.threadId });
  return error ? fail(GENERIC) : { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Has the client had a booking with this firm? Read with their own permissions. */
async function isClientOfFirm(account: SessionAccount, firmId: string): Promise<boolean> {
  if (!uuid.safeParse(firmId).success) return false;
  const { count } = await (await createClient())
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", account.id)
    .eq("firm_id", firmId)
    .not("confirmed_at", "is", null);
  return (count ?? 0) > 0;
}

export type PortalUploadUrlResult = { ok: true; path: string; token: string } | Failure;

/** A one-time URL the browser uploads the file to directly. */
export async function createDocumentUpload(input: {
  firmId: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<PortalUploadUrlResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  if (!(await isClientOfFirm(account, input.firmId))) return fail("Choose a firm you've booked with.");
  if (!ALLOWED_DOCUMENT_TYPES.has(input.mimeType)) return fail("Upload a PDF, Word document (.docx), JPG or PNG.");
  if (!(input.size > 0 && input.size <= MAX_DOCUMENT_BYTES)) return fail("Files must be 10 MB or smaller.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", account.id)
    .eq("firm_id", input.firmId);
  if ((count ?? 0) >= MAX_PORTAL_DOCUMENTS) return fail(`You can keep up to ${MAX_PORTAL_DOCUMENTS} documents with one firm.`);

  const path = `${input.firmId}/${account.id}/${randomUUID()}-${safeFileName(input.fileName)}`;
  const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(GENERIC);
  return { ok: true, path: data.path, token: data.token };
}

/** Records an uploaded file, using the size and type storage reports rather than the browser's. */
export async function confirmDocumentUpload(input: { path: string; fileName: string }): Promise<PortalResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  const [firmId, ownerId] = input.path.split("/");
  if (ownerId !== account.id || input.path.includes("..") || !(await isClientOfFirm(account, firmId))) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: info, error: infoError } = await admin.storage.from(DOCUMENTS_BUCKET).info(input.path);
  if (infoError || !info) return fail("We couldn't find that upload. Please try again.");

  const { error } = await (await createClient()).from("documents").insert({
    firm_id: firmId,
    owner_id: account.id,
    storage_path: input.path,
    file_name: input.fileName.slice(0, 200) || "document",
    mime_type: info.contentType ?? "application/octet-stream",
    size_bytes: info.size ?? 0,
    uploaded_by: account.id,
  });
  if (error) {
    console.error("[portal] document insert failed", { code: error.code, message: error.message });
    await admin.storage.from(DOCUMENTS_BUCKET).remove([input.path]);
    return fail(GENERIC);
  }
  revalidatePath("/portal/documents");
  return { ok: true };
}

export type DownloadUrlResult = { ok: true; url: string } | Failure;

/** A short-lived link to one of the client's own documents. */
export async function getDocumentDownloadUrl(input: { documentId: string }): Promise<DownloadUrlResult> {
  const account = await getSessionAccount();
  if (!account) return fail(SIGNED_OUT);
  if (!uuid.safeParse(input.documentId).success) return fail(GENERIC);

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, file_name")
    .eq("id", input.documentId)
    .eq("owner_id", account.id)
    .maybeSingle();
  if (!doc) return fail("We couldn't find that document.");

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) return fail(GENERIC);
  return { ok: true, url: data.signedUrl };
}
