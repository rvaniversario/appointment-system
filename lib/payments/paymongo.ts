import "server-only";
import { paymentsEnv } from "@/lib/env.server";

/**
 * A minimal PayMongo API client. Calls for a firm send the platform's (parent) secret key
 * with that firm's "Account-ID", so every payment, refund and webhook belongs to the firm's
 * own PayMongo account.
 *
 * Request shapes follow PayMongo's API reference. Where the reference leaves response fields
 * unstated, they're read defensively; check them against real responses in test mode.
 */
export class PaymongoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    detail: string,
  ) {
    super(detail);
    this.name = "PaymongoError";
  }
}

type Json = Record<string, unknown>;

async function request<T = Json>(path: string, init: { method?: string; body?: Json; accountId?: string } = {}): Promise<T> {
  const env = paymentsEnv();
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString("base64")}`,
    Accept: "application/json",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.accountId) headers["Account-ID"] = init.accountId;

  const response = await fetch(`${env.PAYMONGO_API_BASE}${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as Json) : {};
  if (!response.ok) {
    const first = (json.errors as { code?: string; detail?: string }[] | undefined)?.[0];
    throw new PaymongoError(response.status, first?.code ?? null, first?.detail ?? `PayMongo returned ${response.status}`);
  }
  return json as T;
}

const attrs = (json: Json) => ((json.data as Json | undefined)?.attributes ?? {}) as Json;
const dataId = (json: Json) => String((json.data as Json | undefined)?.id ?? "");

/** True when the configured key is a live key. Test and live events are signed differently. */
export const isLiveMode = () => paymentsEnv().PAYMONGO_SECRET_KEY.startsWith("sk_live_");

// ---------------------------------------------------------------------------
// Checkout sessions
// ---------------------------------------------------------------------------

/** Payment methods we offer, in the order PayMongo shows them, if the firm has them enabled. */
const PREFERRED_METHODS = ["card", "gcash", "paymaya", "qrph", "grab_pay", "shopee_pay", "dob"] as const;

/** The firm's enabled payment methods, or a conservative default if PayMongo doesn't say. */
async function paymentMethodsFor(accountId: string): Promise<string[]> {
  try {
    const json = await request<{ data?: unknown }>("/v1/merchants/capabilities/payment_methods", { accountId });
    const enabled = Array.isArray(json.data) ? (json.data as unknown[]).map(String) : [];
    const offered = PREFERRED_METHODS.filter((m) => enabled.includes(m));
    if (offered.length) return offered;
  } catch {
    // Fall through to the default.
  }
  return ["card", "gcash", "paymaya", "qrph"];
}

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}

export async function createCheckoutSession(input: {
  accountId: string;
  amountCentavos: number;
  name: string;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  billing: { name: string; email: string; phone: string };
}): Promise<CheckoutSession> {
  const json = await request("/v1/checkout_sessions", {
    accountId: input.accountId,
    body: {
      data: {
        attributes: {
          line_items: [{ name: input.name, amount: input.amountCentavos, currency: "PHP", quantity: 1, description: input.description }],
          payment_method_types: await paymentMethodsFor(input.accountId),
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
          billing: input.billing,
          send_email_receipt: true,
          show_line_items: true,
        },
      },
    },
  });
  const checkoutUrl = String(attrs(json).checkout_url ?? "");
  if (!dataId(json) || !checkoutUrl) throw new PaymongoError(502, null, "PayMongo returned no checkout URL");
  return { id: dataId(json), checkoutUrl };
}

export interface CheckoutStatus {
  status: string;
  /** The successful payment, if the session has been paid. */
  paid: { paymentId: string; amountCentavos: number } | null;
}

/** Reads a checkout session's payments, the same data a "paid" webhook carries. */
export function readCheckoutPayments(attributes: Json): CheckoutStatus["paid"] {
  const payments = (attributes.payments as Json[] | undefined) ?? [];
  for (const p of payments) {
    const a = (p.attributes ?? {}) as Json;
    if (a.status === "paid") return { paymentId: String(p.id), amountCentavos: Number(a.amount) };
  }
  return null;
}

export async function getCheckoutSession(accountId: string, sessionId: string): Promise<CheckoutStatus> {
  const json = await request(`/v1/checkout_sessions/${encodeURIComponent(sessionId)}`, { accountId });
  const a = attrs(json);
  return { status: String(a.status ?? ""), paid: readCheckoutPayments(a) };
}

/** Stops an unpaid checkout from being paid later. Already-paid or expired sessions are fine. */
export async function expireCheckoutSession(accountId: string, sessionId: string): Promise<void> {
  try {
    await request(`/v1/checkout_sessions/${encodeURIComponent(sessionId)}/expire`, { accountId, method: "POST" });
  } catch (error) {
    if (!(error instanceof PaymongoError) || error.status >= 500) throw error;
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer" | "others";

export async function createRefund(input: {
  accountId: string;
  paymentId: string;
  amountCentavos: number;
  reason: RefundReason;
  notes?: string;
}): Promise<{ id: string; status: string }> {
  const json = await request("/v1/refunds", {
    accountId: input.accountId,
    body: {
      data: {
        attributes: {
          amount: input.amountCentavos,
          payment_id: input.paymentId,
          reason: input.reason,
          ...(input.notes ? { notes: input.notes.slice(0, 255) } : {}),
        },
      },
    },
  });
  return { id: dataId(json), status: String(attrs(json).status ?? "pending") };
}

// ---------------------------------------------------------------------------
// Webhooks and linking (used when connecting a firm)
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = ["checkout_session.payment.paid", "payment.paid", "payment.failed", "payment.refunded", "payment.refund.updated"];

/** Registers a webhook on the firm's account. The signing secret is only returned here. */
export async function createWebhook(accountId: string, url: string): Promise<{ id: string; secret: string }> {
  const json = await request("/v1/webhooks", {
    accountId,
    body: { data: { attributes: { url, events: WEBHOOK_EVENTS } } },
  });
  const secret = String(attrs(json).secret_key ?? "");
  if (!dataId(json) || !secret) throw new PaymongoError(502, null, "PayMongo returned no webhook secret");
  return { id: dataId(json), secret };
}

/** Permissions requested for each linked firm: its payments, refunds on them, and webhooks. */
export const LINK_POLICY = {
  payment: { view: "related" },
  refund: { view: "related", manage: "related" },
  webhook: { view: "global", manage: "global" },
};

export async function inviteFirmAccount(email: string): Promise<{ invitationId: string }> {
  const json = await request<{ data?: Json[] | Json }>("/v2/linking-requests/invites", {
    body: { invites: [{ email, account_type: "merchant" }], policy_selection: LINK_POLICY },
  });
  const first = Array.isArray(json.data) ? json.data[0] : json.data;
  const invitationId = String(first?.id ?? "");
  if (!invitationId) throw new PaymongoError(502, null, "PayMongo returned no invitation id");
  return { invitationId };
}

export async function getLinkingRequest(invitationId: string): Promise<{ status: string; childAccountId: string | null }> {
  const json = await request(`/v2/linking-requests/${encodeURIComponent(invitationId)}`);
  const a = attrs(json);
  const data = (json.data ?? {}) as Json;
  const child = (a.child_account_id ?? data.child_account_id ?? null) as string | null;
  return { status: String(a.status ?? data.status ?? ""), childAccountId: child };
}
