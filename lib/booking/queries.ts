import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { publicEnv } from "@/lib/env";
import { generateSlots, type BusyInterval, type DaySlots } from "./slots";
import { addDays, formatPeso, manilaDate } from "./time";
import type { ConsultTypeOption, PublicAttorney, PublicFirm } from "./public-types";

/** Booking rules. Per-firm settings can replace these in Phase 5. */
export const BOOKING_RULES = {
  leadMinutes: 120,
  stepMinutes: 30,
  /** How far ahead clients can book. */
  maxDaysAhead: 60,
  daysPerPage: 7,
  holdMinutes: 15,
} as const;

/** Statuses that occupy an attorney's time. Expired holds are excluded separately. */
const ACTIVE_STATUSES = ["held", "pending_payment", "confirmed"] as const;

/** An active firm, or null. RLS hides firms that aren't public. */
export const getPublicFirm = cache(async (slug: string): Promise<PublicFirm | null> => {
  const { data } = await createPublicClient()
    .from("firms")
    .select("id, slug, name")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  return data;
});

function photoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/attorney-photos/${path}`;
}

/** The firm's active attorneys, ordered by name. */
export const listFirmAttorneys = cache(async (firmId: string): Promise<PublicAttorney[]> => {
  const supabase = createPublicClient();
  const [{ data: attorneys }, { data: offices }] = await Promise.all([
    supabase
      .from("attorneys")
      .select("id, slug, full_name, practice_areas, languages, office_id, bio, ibp_roll_no, admitted_year, photo_path")
      .eq("firm_id", firmId)
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("offices").select("id, name").eq("firm_id", firmId),
  ]);
  const officeNames = new Map((offices ?? []).map((o) => [o.id, o.name]));

  return (attorneys ?? []).map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.full_name,
    practiceAreas: a.practice_areas,
    languages: a.languages,
    location: (a.office_id && officeNames.get(a.office_id)) || "",
    bio: a.bio,
    credentials: [a.ibp_roll_no && `IBP Roll No. ${a.ibp_roll_no}`, a.admitted_year && `Admitted ${a.admitted_year}`]
      .filter(Boolean)
      .join(" · "),
    photoUrl: photoUrl(a.photo_path),
  }));
});

/** The firm's own consultation agreement, or null for the standard one. */
export const getFirmAgreementText = cache(async (firmId: string): Promise<string | null> => {
  const { data } = await createPublicClient().from("firms").select("agreement_text").eq("id", firmId).maybeSingle();
  return data?.agreement_text ?? null;
});

export async function getFirmAttorney(firmId: string, slug: string): Promise<PublicAttorney | null> {
  return (await listFirmAttorneys(firmId)).find((a) => a.slug === slug) ?? null;
}

export const getConsultTypes = cache(async (firmId: string): Promise<ConsultTypeOption[]> => {
  const { data } = await createPublicClient()
    .from("consult_types")
    .select("id, label, description, mode, duration_minutes, price_centavos")
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    mode: c.mode,
    durationMinutes: c.duration_minutes,
    priceCentavos: c.price_centavos,
    priceLabel: c.price_centavos === 0 ? "Free" : formatPeso(c.price_centavos),
  }));
});

/**
 * Open times for an attorney, from their weekly hours minus leave and existing bookings.
 * Uses the service role because appointments and leave reasons aren't public; only free
 * start times leave this function.
 */
export async function getAvailability(input: {
  attorneyId: string;
  durationMinutes: number;
  fromDate: string;
  days: number;
  /** A hold of the visitor's own that shouldn't block them, e.g. when changing time. */
  ignoreAppointmentId?: string;
}): Promise<DaySlots[]> {
  const admin = createAdminClient();
  const rangeStart = new Date(`${input.fromDate}T00:00:00+08:00`);
  const rangeEnd = new Date(`${addDays(input.fromDate, input.days)}T00:00:00+08:00`);
  const now = new Date();

  const [{ data: rules }, { data: exceptions }, { data: appointments }] = await Promise.all([
    admin.from("availability_rules").select("weekday, start_time, end_time").eq("attorney_id", input.attorneyId),
    admin
      .from("availability_exceptions")
      .select("starts_at, ends_at")
      .eq("attorney_id", input.attorneyId)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
    admin
      .from("appointments")
      .select("id, starts_at, ends_at, status, hold_expires_at")
      .eq("attorney_id", input.attorneyId)
      .in("status", ACTIVE_STATUSES)
      .lt("starts_at", rangeEnd.toISOString())
      .gt("ends_at", rangeStart.toISOString()),
  ]);

  const busy: BusyInterval[] = [
    ...(exceptions ?? []).map((e) => ({ startsAt: new Date(e.starts_at), endsAt: new Date(e.ends_at) })),
    ...(appointments ?? [])
      .filter((a) => a.id !== input.ignoreAppointmentId)
      // Holds and unpaid checkouts stop blocking the time once they lapse.
      .filter((a) => !(a.status !== "confirmed" && a.hold_expires_at && new Date(a.hold_expires_at) <= now))
      .map((a) => ({ startsAt: new Date(a.starts_at), endsAt: new Date(a.ends_at) })),
  ];

  return generateSlots({
    rules: (rules ?? []).map((r) => ({ weekday: r.weekday, startTime: r.start_time, endTime: r.end_time })),
    busy,
    durationMinutes: input.durationMinutes,
    fromDate: input.fromDate,
    days: input.days,
    now,
    leadMinutes: BOOKING_RULES.leadMinutes,
    stepMinutes: BOOKING_RULES.stepMinutes,
  });
}

export interface SlotPageData {
  fromDate: string;
  days: DaySlots[];
  canGoBack: boolean;
  canGoForward: boolean;
}

/** One page of open times, clamped to the booking window. */
export async function getSlotPage(input: {
  attorneyId: string;
  durationMinutes: number;
  fromDate?: string;
  ignoreAppointmentId?: string;
}): Promise<SlotPageData> {
  const { firstDate, lastDate } = bookingWindow();
  let fromDate = input.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) ? input.fromDate : firstDate;
  if (fromDate < firstDate) fromDate = firstDate;
  if (fromDate > lastDate) fromDate = lastDate;
  const remaining = Math.round((Date.parse(lastDate) - Date.parse(fromDate)) / 86_400_000) + 1;
  const days = Math.min(BOOKING_RULES.daysPerPage, remaining);

  return {
    fromDate,
    days: await getAvailability({ ...input, fromDate, days }),
    canGoBack: fromDate > firstDate,
    canGoForward: addDays(fromDate, days) <= lastDate,
  };
}

/** Today in Manila, and the last date clients may book. */
export function bookingWindow(): { firstDate: string; lastDate: string } {
  const firstDate = manilaDate(new Date());
  return { firstDate, lastDate: addDays(firstDate, BOOKING_RULES.maxDaysAhead - 1) };
}
