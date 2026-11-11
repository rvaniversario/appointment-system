"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notifyFirmDecision } from "@/lib/notify/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOperator } from "./auth";

/*
 * Operator actions. Each runs a database function as the signed-in operator, which checks
 * is_platform_admin() (two-factor included) and writes the audit entry itself.
 */

export type AdminResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";
const uuid = z.guid();
const fail = (error: string): AdminResult => ({ ok: false, error });

function refresh() {
  revalidatePath("/admin", "layout");
  // The firm's public page and its dashboard change with its status and attorneys.
  revalidatePath("/f", "layout");
  revalidatePath("/staff", "layout");
}

export async function setAttorneyCheck(input: { firmId: string; attorneyId: string; checked: boolean }): Promise<AdminResult> {
  await requireOperator();
  const parsed = z.object({ firmId: uuid, attorneyId: uuid, checked: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail(GENERIC);

  const { data, error } = await (await createClient()).rpc("admin_set_attorney_check", {
    p_attorney: parsed.data.attorneyId,
    p_checked: parsed.data.checked,
  });
  if (error) {
    console.error("[admin] attorney check failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  if (data === "incomplete") return fail("This attorney has no roll number or year admitted to check. Ask the firm to add them.");
  if (data !== "ok") return fail(data === "missing" ? "That attorney no longer exists." : "Your session needs two-factor. Sign in again.");
  refresh();
  return { ok: true };
}

const ACTION_ERRORS: Record<string, string> = {
  wrong_status: "The firm's status changed. Reload the page.",
  note_required: "Write a note for the firm.",
  incomplete: "The firm hasn't finished its setup checklist.",
  no_checked_attorney: "Check at least one active attorney's roll number first.",
  missing: "That firm no longer exists.",
  forbidden: "Your session needs two-factor. Sign in again.",
};

export async function firmAction(input: { firmId: string; action: "approve" | "send_back" | "suspend" | "reinstate"; note?: string }): Promise<AdminResult> {
  await requireOperator();
  const parsed = z
    .object({ firmId: uuid, action: z.enum(["approve", "send_back", "suspend", "reinstate"]), note: z.string().trim().max(1000).optional() })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.path[0] === "note" ? "Keep the note under 1,000 characters." : GENERIC);
  const { firmId, action, note } = parsed.data;

  const { data, error } = await (await createClient()).rpc("admin_firm_action", { p_firm: firmId, p_action: action, p_note: note || null });
  if (error) {
    console.error("[admin] firm action failed", { action, code: error.code, message: error.message });
    return fail(GENERIC);
  }
  if (data !== "ok") return fail(ACTION_ERRORS[data] ?? GENERIC);

  const { data: firm } = await createAdminClient().from("firms").select("slug, status").eq("id", firmId).single();
  const slug = firm?.slug ?? "";
  if (action === "approve") await notifyFirmDecision(firmId, { kind: "approved", slug });
  else if (action === "send_back") await notifyFirmDecision(firmId, { kind: "sent_back", note: note ?? "" });
  else if (action === "suspend") await notifyFirmDecision(firmId, { kind: "suspended", note: note ?? "" });
  else await notifyFirmDecision(firmId, { kind: "reinstated", slug, live: firm?.status === "active" });
  refresh();
  return { ok: true };
}

/** Manila's today, as YYYY-MM-DD. */
const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

export async function setComp(input: { firmId: string; comped: boolean; until: string; note: string }): Promise<AdminResult> {
  await requireOperator();
  const parsed = z
    .object({
      firmId: uuid,
      comped: z.boolean(),
      until: z.union([z.literal(""), z.iso.date()]),
      note: z.string().trim().max(500),
    })
    .safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.path[0] === "until" ? "Enter a valid date." : "Keep the note under 500 characters.");
  const { firmId, comped, until, note } = parsed.data;
  if (comped && until && until < manilaToday()) return fail("The end date can't be in the past.");

  const { data, error } = await (await createClient()).rpc("admin_set_comp", {
    p_firm: firmId,
    p_comped: comped,
    p_until: comped && until ? until : null,
    p_note: note || null,
  });
  if (error) {
    console.error("[admin] comp failed", { code: error.code, message: error.message });
    return fail(GENERIC);
  }
  if (data === "past_date") return fail("The end date can't be in the past.");
  if (data !== "ok") return fail(ACTION_ERRORS[data] ?? GENERIC);
  refresh();
  return { ok: true };
}
