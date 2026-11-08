#!/usr/bin/env node
/**
 * Connects a firm's PayMongo account (a linked child of the platform's account), so the firm
 * can take online payments. Until firms can do this themselves (Phase 7), an operator runs it.
 *
 *   npm run paymongo:link -- --firm santos-law --account org_123     # already linked in PayMongo
 *   npm run paymongo:link -- --firm santos-law --invite atty@firm.ph  # send a linking invitation
 *   npm run paymongo:link -- --firm santos-law --check                # finish once they accept
 *   npm run paymongo:link -- --firm santos-law --disable              # stop online payments
 *
 * Activating registers a webhook on the firm's account, pointing at
 * <site>/api/webhooks/paymongo/<firm id>. The site must be reachable over HTTPS by PayMongo;
 * pass --webhook-base https://… to override NEXT_PUBLIC_SITE_URL (e.g. a tunnel in dev).
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PAYMONGO_SECRET_KEY.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    firm: { type: "string" },
    account: { type: "string" },
    invite: { type: "string" },
    check: { type: "boolean", default: false },
    disable: { type: "boolean", default: false },
    "webhook-base": { type: "string" },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const modes = [values.account, values.invite, values.check || undefined, values.disable || undefined].filter(Boolean);
if (!values.firm || modes.length !== 1) {
  fail("Usage: --firm <slug> and one of --account <org_…> | --invite <email> | --check | --disable");
}

const key = process.env.PAYMONGO_SECRET_KEY ?? "";
if (!/^sk_(test|live)_/.test(key)) fail("PAYMONGO_SECRET_KEY must be set to the platform's PayMongo secret key.");
const livemode = key.startsWith("sk_live_");
const apiBase = process.env.PAYMONGO_API_BASE || "https://api.paymongo.com";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function paymongo(path, { method, body, accountId } = {}) {
  const headers = { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (accountId) headers["Account-ID"] = accountId;
  const response = await fetch(`${apiBase}${path}`, { method: method ?? (body ? "POST" : "GET"), headers, body: body && JSON.stringify(body) });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const e = json.errors?.[0];
    fail(`PayMongo ${response.status} on ${path}: ${e?.code ?? ""} ${e?.detail ?? text}`);
  }
  return json;
}

const { data: firm, error: firmError } = await supabase.from("firms").select("id, slug, name").eq("slug", values.firm).maybeSingle();
if (firmError) throw firmError;
if (!firm) fail(`No firm with slug "${values.firm}".`);
const { data: existing } = await supabase.from("firm_payment_accounts").select("*").eq("firm_id", firm.id).maybeSingle();

async function audit(action, details) {
  await supabase.from("audit_log").insert({ firm_id: firm.id, action, entity: "firm_payment_accounts", entity_id: firm.id, details });
}

/** Registers this app's webhook on the firm's PayMongo account and marks it active. */
async function activate(accountId) {
  const base = (values["webhook-base"] ?? process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) fail("The webhook needs an https:// site. Set NEXT_PUBLIC_SITE_URL or pass --webhook-base.");

  // A request on the firm's behalf also proves the link is active and permitted.
  if (existing?.webhook_id && existing.account_id === accountId) {
    await paymongo(`/v1/webhooks/${existing.webhook_id}/disable`, { method: "POST", accountId }).catch(() => {});
  }
  const webhook = await paymongo("/v1/webhooks", {
    accountId,
    body: {
      data: {
        attributes: {
          url: `${base}/api/webhooks/paymongo/${firm.id}`,
          events: ["checkout_session.payment.paid", "payment.paid", "payment.failed", "payment.refunded", "payment.refund.updated"],
        },
      },
    },
  });
  const secret = webhook.data?.attributes?.secret_key;
  if (!webhook.data?.id || !secret) fail("PayMongo didn't return a webhook secret.");

  const { error } = await supabase.from("firm_payment_accounts").upsert({
    firm_id: firm.id,
    account_id: accountId,
    status: "active",
    livemode,
    webhook_id: webhook.data.id,
    webhook_secret: secret,
  });
  if (error) throw error;
  await audit("payments.connected", { account_id: accountId, livemode, webhook_id: webhook.data.id });
  console.log(`✔ ${firm.name} now takes online payments through ${accountId}${livemode ? "" : " (test mode)"}.`);
}

if (values.account) {
  if (!/^org_[A-Za-z0-9]+$/.test(values.account)) fail("--account must be a PayMongo account id like org_…");
  await activate(values.account);
} else if (values.invite) {
  const json = await paymongo("/v2/linking-requests/invites", {
    body: {
      invites: [{ email: values.invite, account_type: "merchant" }],
      policy_selection: {
        payment: { view: "related" },
        refund: { view: "related", manage: "related" },
        webhook: { view: "global", manage: "global" },
      },
    },
  });
  const first = Array.isArray(json.data) ? json.data[0] : json.data;
  if (!first?.id) fail("PayMongo didn't return an invitation id.");
  const { error } = await supabase
    .from("firm_payment_accounts")
    .upsert({ firm_id: firm.id, invitation_id: first.id, status: "invited", livemode, account_id: null, webhook_id: null, webhook_secret: null });
  if (error) throw error;
  await audit("payments.invited", { email: values.invite, invitation_id: first.id });
  console.log(`✔ Invitation ${first.id} sent to ${values.invite}. When they accept, run with --check.`);
} else if (values.check) {
  if (!existing?.invitation_id) fail("This firm has no pending invitation.");
  const json = await paymongo(`/v2/linking-requests/${existing.invitation_id}`);
  const status = json.data?.attributes?.status ?? json.data?.status;
  const child = json.data?.attributes?.child_account_id ?? json.data?.child_account_id;
  if (status !== "accepted" || !child) {
    console.log(`Invitation is "${status ?? "unknown"}". Ask the firm to accept it under Settings → Invitations in PayMongo.`);
  } else {
    await activate(child);
  }
} else if (values.disable) {
  if (!existing) fail("This firm has no PayMongo connection.");
  await supabase.from("firm_payment_accounts").update({ status: "disabled" }).eq("firm_id", firm.id);
  await audit("payments.disabled", {});
  console.log(`✔ Online payments are off for ${firm.name}. Existing payments are unaffected.`);
}
