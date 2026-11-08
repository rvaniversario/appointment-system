"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/auth/session";
import { normalizeMobile } from "@/lib/profile/mobile";
import { buildAgreement } from "./agreement";
import {
  BOOKING_RULES,
  bookingWindow,
  getAvailability,
  getConsultTypes,
  getFirmAttorney,
  getPublicFirm,
  getSlotPage,
  type SlotPageData,
} from "./queries";
import { getBookingFromCookie, isLiveHold, newBookingToken, setBookingCookie, type BookingRow } from "./session";
import { isDateString, manilaDate } from "./time";

/**
 * Server actions for the public booking wizard. Visitors aren't signed in, so these run
 * with the service role. Every action re-resolves the firm and attorney from their slugs,
 * and every action after the hold proves ownership with the booking cookie.
 */

type Failure = { ok: false; error: string; code?: "taken" | "expired" | "unavailable" };
const fail = (error: string, code?: Failure["code"]): Failure => ({ ok: false, error, code });

const EXPIRED = "Your reserved time has expired. Please choose a time again.";
const GENERIC = "Something went wrong. Please try again.";

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(100);
const uuidSchema = z.uuid();

async function resolve(firmSlug: string, attorneySlug?: string) {
  if (!slugSchema.safeParse(firmSlug).success) return null;
  const firm = await getPublicFirm(firmSlug);
  if (!firm) return null;
  if (attorneySlug === undefined) return { firm, attorney: null };
  if (!slugSchema.safeParse(attorneySlug).success) return null;
  const attorney = await getFirmAttorney(firm.id, attorneySlug);
  return attorney ? { firm, attorney } : null;
}

/** The visitor's booking at this firm, if it's still a live hold. */
async function liveBooking(firmSlug: string): Promise<{ firmId: string; booking: BookingRow } | null> {
  const resolved = await resolve(firmSlug);
  if (!resolved) return null;
  const booking = await getBookingFromCookie(resolved.firm.id);
  return booking && isLiveHold(booking) ? { firmId: resolved.firm.id, booking } : null;
}

const holdExpiry = () => new Date(Date.now() + BOOKING_RULES.holdMinutes * 60_000).toISOString();

/** Each completed step keeps the hold alive for another few minutes. */
async function extendHold(appointmentId: string) {
  await createAdminClient()
    .from("appointments")
    .update({ hold_expires_at: holdExpiry() })
    .eq("id", appointmentId)
    .eq("status", "held");
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type SlotsResult = ({ ok: true } & SlotPageData) | Failure;

export async function loadSlots(input: {
  firmSlug: string;
  attorneySlug: string;
  consultTypeId: string;
  fromDate?: string;
}): Promise<SlotsResult> {
  const resolved = await resolve(input.firmSlug, input.attorneySlug);
  if (!resolved?.attorney) return fail("This attorney isn't taking bookings.", "unavailable");
  const consultType = (await getConsultTypes(resolved.firm.id)).find((c) => c.id === input.consultTypeId);
  if (!consultType) return fail("Choose a consultation type.");

  const booking = await getBookingFromCookie(resolved.firm.id);
  const page = await getSlotPage({
    attorneyId: resolved.attorney.id,
    durationMinutes: consultType.durationMinutes,
    fromDate: input.fromDate && isDateString(input.fromDate) ? input.fromDate : undefined,
    ignoreAppointmentId: booking && isLiveHold(booking) ? booking.id : undefined,
  });
  return { ok: true, ...page };
}

export type HoldResult = { ok: true; holdExpiresAt: string } | Failure;

/** Reserves a time for a few minutes while the visitor finishes the wizard. */
export async function holdSlot(input: {
  firmSlug: string;
  attorneySlug: string;
  consultTypeId: string;
  startsAt: string;
}): Promise<HoldResult> {
  const resolved = await resolve(input.firmSlug, input.attorneySlug);
  if (!resolved?.attorney) return fail("This attorney isn't taking bookings.", "unavailable");
  const { firm, attorney } = resolved;
  const admin = createAdminClient();

  const { data: accepting } = await admin.rpc("firm_can_accept_bookings", { p_firm: firm.id });
  if (!accepting) return fail("This firm isn't taking online bookings right now.", "unavailable");

  const consultType = (await getConsultTypes(firm.id)).find((c) => c.id === input.consultTypeId);
  const startsAt = new Date(input.startsAt);
  if (!consultType || Number.isNaN(startsAt.getTime())) return fail("Choose a consultation type and time.");

  // Only times the visitor could actually see are accepted.
  const existing = await getBookingFromCookie(firm.id);
  const ownHold = existing && isLiveHold(existing) ? existing : null;
  const [day] = await getAvailability({
    attorneyId: attorney.id,
    durationMinutes: consultType.durationMinutes,
    fromDate: manilaDate(startsAt),
    days: 1,
    ignoreAppointmentId: ownHold?.id,
  });
  const { lastDate } = bookingWindow();
  if (day.date > lastDate || !day.slots.some((s) => s.startsAt === startsAt.toISOString())) {
    return fail("That time was just taken. Please choose another.", "taken");
  }

  const endsAt = new Date(startsAt.getTime() + consultType.durationMinutes * 60_000);

  // Expired holds still count for the no-overlap constraint until released.
  await admin
    .from("appointments")
    .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "hold expired" })
    .eq("attorney_id", attorney.id)
    .eq("status", "held")
    .lt("hold_expires_at", new Date().toISOString())
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString());

  const fields = {
    firm_id: firm.id,
    attorney_id: attorney.id,
    consult_type_id: consultType.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    price_centavos: consultType.priceCentavos,
    hold_expires_at: holdExpiry(),
  };

  // Changing the time keeps the same booking, and whatever was already entered.
  const sameAttorney = ownHold && ownHold.attorney_id === attorney.id;
  if (ownHold && !sameAttorney) {
    await admin.from("appointments").update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_reason: "replaced by visitor" }).eq("id", ownHold.id);
  }

  const { token, hash } = newBookingToken();
  const { data, error } = sameAttorney
    ? await admin.from("appointments").update({ ...fields, booking_token_hash: hash }).eq("id", ownHold.id).select("id").single()
    : await admin.from("appointments").insert({ ...fields, status: "held", booking_token_hash: hash }).select("id").single();

  if (error?.code === "23P01") return fail("That time was just taken. Please choose another.", "taken");
  if (error || !data) {
    console.error("[booking] hold failed", { code: error?.code, message: error?.message });
    return fail(GENERIC);
  }

  await setBookingCookie(firm.slug, data.id, token);
  return { ok: true, holdExpiresAt: fields.hold_expires_at };
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

const intakeSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  phone: z.string().max(40),
  caseType: z.string().trim().min(1).max(100),
  urgency: z.enum(["standard", "urgent"]),
  details: z.string().trim().min(1).max(5000),
  opposingParty: z.string().trim().max(200),
  ack: z.literal(true),
  privacyConsent: z.literal(true),
  smsOptIn: z.boolean(),
});

/** As the form sends it; the schema then requires both checkboxes to be ticked. */
export type IntakeInput = Omit<z.input<typeof intakeSchema>, "ack" | "privacyConsent"> & {
  ack: boolean;
  privacyConsent: boolean;
};
export type IntakeResult = { ok: true } | (Failure & { fields?: string[] });

/** Finds the client's account by email, or creates one they can later sign in to by email code. */
async function findOrCreateClient(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const find = async () => (await admin.from("profiles").select("id").eq("email", email).maybeSingle()).data?.id ?? null;

  const existing = await find();
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (data.user) return data.user.id;
  // Someone else created it in the meantime.
  if (error) return find();
  return null;
}

export async function submitIntake(input: { firmSlug: string; intake: IntakeInput }): Promise<IntakeResult> {
  const live = await liveBooking(input.firmSlug);
  if (!live) return fail(EXPIRED, "expired");

  const parsed = intakeSchema.safeParse({ ...input.intake, email: input.intake.email?.trim().toLowerCase() });
  const phone = normalizeMobile(input.intake.phone ?? "");
  if (!parsed.success || !phone) {
    const fields = parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0]));
    if (!phone) fields.push("phone");
    return { ok: false, error: "Please check the highlighted fields.", fields };
  }
  const intake = parsed.data;
  const admin = createAdminClient();

  // Signed-in clients book as themselves; guests are matched to an account by email.
  const session = await getSessionAccount();
  const clientId = session?.id ?? (await findOrCreateClient(intake.email));
  if (!clientId) return fail(GENERIC);

  // Fill in profile details the client hasn't set yet, without overwriting any.
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, mobile, privacy_consent_at, sms_opt_in")
    .eq("id", clientId)
    .single();
  const now = new Date().toISOString();
  if (profile) {
    await admin
      .from("profiles")
      .update({
        first_name: profile.first_name || intake.firstName,
        last_name: profile.last_name || intake.lastName,
        mobile: profile.mobile || phone,
        privacy_consent_at: profile.privacy_consent_at || now,
        sms_opt_in: profile.sms_opt_in || intake.smsOptIn,
      })
      .eq("id", clientId);
  }

  const { error } = await admin.from("intakes").upsert(
    {
      firm_id: live.firmId,
      appointment_id: live.booking.id,
      client_id: clientId,
      first_name: intake.firstName,
      last_name: intake.lastName,
      email: intake.email,
      phone,
      case_type: intake.caseType,
      urgency: intake.urgency,
      details: intake.details,
      opposing_party: intake.opposingParty,
      privacy_consent_at: now,
      sms_opt_in: intake.smsOptIn,
    },
    { onConflict: "appointment_id" },
  );
  if (error) {
    console.error("[booking] intake failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }

  await admin.from("appointments").update({ client_id: clientId }).eq("id", live.booking.id);

  // Re-run from scratch in case the names changed. Staff see the result; the client doesn't.
  await admin.from("conflict_hits").delete().eq("appointment_id", live.booking.id);
  const { error: conflictError } = await admin.rpc("run_conflict_check", { p_appointment: live.booking.id });
  if (conflictError) console.error("[booking] conflict check failed", { message: conflictError.message });

  await extendHold(live.booking.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const BUCKET = "client-documents";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 10;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

export interface UploadedDocument {
  id: string;
  name: string;
}

/** Keeps letters, digits, dots, dashes and underscores, so the storage path is predictable. */
function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-100);
  return cleaned.replace(/^[._]+/, "") || "document";
}

export type UploadUrlResult = { ok: true; path: string; token: string } | Failure;

/** A one-time URL the browser uploads the file to directly. */
export async function createUploadUrl(input: {
  firmSlug: string;
  fileName: string;
  size: number;
  mimeType: string;
}): Promise<UploadUrlResult> {
  const live = await liveBooking(input.firmSlug);
  if (!live) return fail(EXPIRED, "expired");
  const clientId = live.booking.client_id;
  if (!clientId) return fail("Please complete the intake form first.");

  if (!ALLOWED_TYPES.has(input.mimeType)) return fail("Upload a PDF, Word document (.docx), JPG or PNG.");
  if (!(input.size > 0 && input.size <= MAX_BYTES)) return fail("Files must be 10 MB or smaller.");

  const admin = createAdminClient();
  const { count } = await admin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", live.booking.id);
  if ((count ?? 0) >= MAX_DOCUMENTS) return fail(`You can upload up to ${MAX_DOCUMENTS} documents.`);

  const path = `${live.firmId}/${clientId}/${randomUUID()}-${safeFileName(input.fileName)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return fail(GENERIC);
  return { ok: true, path: data.path, token: data.token };
}

export type ConfirmUploadResult = { ok: true; document: UploadedDocument } | Failure;

/** Records an uploaded file, using the size and type storage reports rather than the browser's. */
export async function confirmUpload(input: {
  firmSlug: string;
  path: string;
  fileName: string;
}): Promise<ConfirmUploadResult> {
  const live = await liveBooking(input.firmSlug);
  if (!live?.booking.client_id) return fail(EXPIRED, "expired");
  const clientId = live.booking.client_id;
  if (!input.path.startsWith(`${live.firmId}/${clientId}/`) || input.path.includes("..")) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: info, error: infoError } = await admin.storage.from(BUCKET).info(input.path);
  if (infoError || !info) return fail("We couldn't find that upload. Please try again.");

  const { data, error } = await admin
    .from("documents")
    .insert({
      firm_id: live.firmId,
      owner_id: clientId,
      appointment_id: live.booking.id,
      storage_path: input.path,
      file_name: input.fileName.slice(0, 200) || "document",
      mime_type: info.contentType ?? "application/octet-stream",
      size_bytes: info.size ?? 0,
      uploaded_by: clientId,
    })
    .select("id, file_name")
    .single();
  if (error || !data) {
    console.error("[booking] document insert failed", { code: error?.code, message: error?.message });
    await admin.storage.from(BUCKET).remove([input.path]);
    return fail(GENERIC);
  }

  await extendHold(live.booking.id);
  return { ok: true, document: { id: data.id, name: data.file_name } };
}

export async function removeUpload(input: { firmSlug: string; documentId: string }): Promise<{ ok: true } | Failure> {
  const live = await liveBooking(input.firmSlug);
  if (!live) return fail(EXPIRED, "expired");
  if (!uuidSchema.safeParse(input.documentId).success) return fail(GENERIC);

  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, storage_path")
    .eq("id", input.documentId)
    .eq("appointment_id", live.booking.id)
    .maybeSingle();
  if (!doc) return { ok: true };

  await admin.storage.from(BUCKET).remove([doc.storage_path]);
  await admin.from("documents").delete().eq("id", doc.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Agreement and confirmation
// ---------------------------------------------------------------------------

function clientIp(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim() ?? "";
  return z.union([z.ipv4(), z.ipv6()]).safeParse(first).success ? first : null;
}

export async function signAgreement(input: { firmSlug: string; signatureName: string }): Promise<{ ok: true } | Failure> {
  const live = await liveBooking(input.firmSlug);
  if (!live) return fail(EXPIRED, "expired");
  const signature = input.signatureName.trim();
  if (signature.length < 2 || signature.length > 200) return fail("Type your full name to sign.");

  const admin = createAdminClient();
  const { data: firm } = await admin.from("firms").select("name, agreement_text").eq("id", live.firmId).single();
  if (!firm) return fail(GENERIC);
  const agreement = buildAgreement({ name: firm.name, agreementText: firm.agreement_text });

  const h = await headers();
  await admin.from("agreements").delete().eq("appointment_id", live.booking.id);
  const { error } = await admin.from("agreements").insert({
    firm_id: live.firmId,
    appointment_id: live.booking.id,
    client_id: live.booking.client_id,
    version: agreement.version,
    body_sha256: agreement.sha256,
    signature_name: signature,
    ip_address: clientIp(h.get("x-forwarded-for") ?? h.get("x-real-ip")),
    user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) {
    console.error("[booking] agreement insert failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }

  await extendHold(live.booking.id);
  return { ok: true };
}

/** Free consultations need no payment, so they're confirmed as soon as every step is done. */
export async function confirmFreeBooking(input: { firmSlug: string }): Promise<{ ok: true } | Failure> {
  const live = await liveBooking(input.firmSlug);
  if (!live) return fail(EXPIRED, "expired");
  const { booking } = live;
  if (booking.price_centavos !== 0) return fail("Online payment isn't available yet.", "unavailable");

  const admin = createAdminClient();
  const [{ count: intakes }, { count: agreements }] = await Promise.all([
    admin.from("intakes").select("id", { count: "exact", head: true }).eq("appointment_id", booking.id),
    admin.from("agreements").select("id", { count: "exact", head: true }).eq("appointment_id", booking.id),
  ]);
  if (!booking.client_id || !intakes) return fail("Please complete the intake form first.");
  if (!agreements) return fail("Please sign the consultation agreement first.");

  // Video consultations get the attorney's standing meeting link.
  const [{ data: consultType }, { data: attorney }] = await Promise.all([
    admin.from("consult_types").select("mode").eq("id", booking.consult_type_id).single(),
    admin.from("attorneys").select("meeting_url").eq("id", booking.attorney_id).single(),
  ]);

  const { error } = await admin
    .from("appointments")
    .update({
      status: "confirmed",
      hold_expires_at: null,
      meeting_url: consultType?.mode === "video" ? (attorney?.meeting_url ?? null) : null,
    })
    .eq("id", booking.id)
    .eq("status", "held");
  if (error) {
    console.error("[booking] confirm failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  return { ok: true };
}
