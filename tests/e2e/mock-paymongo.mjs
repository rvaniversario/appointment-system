// A local stand-in for PayMongo's API, for end-to-end tests without real keys.
// Shapes follow PayMongo's API reference; signatures use the same t/te/li scheme.
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = 4010;
const APP = process.env.WEBHOOK_TARGET ?? "http://localhost:3100"; // where webhooks are actually delivered
const webhooks = new Map(); // accountId -> { id, url, secret }
const sessions = new Map(); // id -> session
const log = [];
const id = (prefix) => `${prefix}_${randomBytes(8).toString("hex")}`;

async function sendWebhook(accountId, type, resource, { badSignature = false } = {}) {
  const hook = webhooks.get(accountId);
  if (!hook) return;
  const event = { data: { id: id("evt"), type: "event", attributes: { type, livemode: false, data: resource } } };
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", badSignature ? "wrong" : hook.secret).update(`${t}.${body}`).digest("hex");
  const target = hook.url.replace(/^https?:\/\/[^/]+/, APP);
  const res = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "Paymongo-Signature": `t=${t},te=${sig},li=` }, body });
  log.push({ kind: "webhook-sent", type, status: res.status, eventId: event.data.id });
  return { event, body, status: res.status };
}

const sessionResource = (s) => ({
  id: s.id,
  type: "checkout_session",
  attributes: {
    checkout_url: `http://localhost:${PORT}/pay/${s.id}`,
    status: s.status,
    reference_number: s.reference_number,
    metadata: s.metadata,
    line_items: s.line_items,
    payments: s.payment ? [{ id: s.payment.id, type: "payment", attributes: { amount: s.payment.amount, status: "paid" } }] : [],
  },
});

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw && req.headers["content-type"]?.includes("json") ? JSON.parse(raw) : {};
  const accountId = req.headers["account-id"] ?? null;
  const auth = req.headers.authorization ?? "";
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/v2/")) {
    log.push({ kind: "api", method: req.method, path: url.pathname, accountId, auth: auth.startsWith("Basic ") });
    if (!auth.startsWith("Basic ")) return json(res, 401, { errors: [{ code: "unauthorized", detail: "no key" }] });
  }

  // --- Test helpers
  if (url.pathname === "/__log") return json(res, 200, log);
  if (url.pathname === "/__resend" && req.method === "POST") {
    // Re-delivers the last event verbatim (duplicate delivery).
    const last = [...log].reverse().find((l) => l.kind === "webhook-body");
    const hook = webhooks.get(last.accountId);
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", hook.secret).update(`${t}.${last.body}`).digest("hex");
    const r = await fetch(hook.url.replace(/^https?:\/\/[^/]+/, APP), { method: "POST", headers: { "Content-Type": "application/json", "Paymongo-Signature": `t=${t},te=${sig},li=` }, body: last.body });
    return json(res, 200, { status: r.status, body: await r.json().catch(() => null) });
  }
  if (url.pathname === "/__forged" && req.method === "POST") {
    const accountId2 = url.searchParams.get("account");
    const r = await sendWebhook(accountId2, "checkout_session.payment.paid", { id: "cs_forged", attributes: { payments: [] } }, { badSignature: true });
    return json(res, 200, { status: r?.status });
  }

  // --- API
  if (url.pathname === "/v1/webhooks" && req.method === "POST") {
    const hook = { id: id("hook"), url: body.data.attributes.url, secret: `whsk_${randomBytes(12).toString("hex")}` };
    webhooks.set(accountId, hook);
    return json(res, 200, { data: { id: hook.id, type: "webhook", attributes: { url: hook.url, secret_key: hook.secret, events: body.data.attributes.events, status: "enabled" } } });
  }
  if (/^\/v1\/webhooks\/[^/]+\/disable$/.test(url.pathname)) return json(res, 200, { data: { id: "x", attributes: { status: "disabled" } } });
  if (url.pathname === "/v1/merchants/capabilities/payment_methods") return json(res, 200, { data: ["card", "gcash", "paymaya", "qrph"] });
  if (url.pathname === "/v1/checkout_sessions" && req.method === "POST") {
    if (!accountId) return json(res, 400, { errors: [{ code: "parameter_required", detail: "Account-ID missing in test" }] });
    const a = body.data.attributes;
    const s = { id: id("cs"), accountId, status: "active", ...a };
    sessions.set(s.id, s);
    log.push({ kind: "checkout", id: s.id, accountId, amount: a.line_items[0].amount, methods: a.payment_method_types, success_url: a.success_url, cancel_url: a.cancel_url, metadata: a.metadata });
    return json(res, 200, { data: sessionResource(s) });
  }
  let m;
  if ((m = url.pathname.match(/^\/v1\/checkout_sessions\/([^/]+)$/)) && req.method === "GET") {
    const s = sessions.get(m[1]);
    return s ? json(res, 200, { data: sessionResource(s) }) : json(res, 404, { errors: [{ code: "resource_not_found", detail: "no session" }] });
  }
  if ((m = url.pathname.match(/^\/v1\/checkout_sessions\/([^/]+)\/expire$/))) {
    const s = sessions.get(m[1]);
    if (s && s.status === "active") s.status = "expired";
    log.push({ kind: "expired", id: m[1], accountId });
    return json(res, 200, { data: s ? sessionResource(s) : {} });
  }
  if (url.pathname === "/v1/refunds" && req.method === "POST") {
    const a = body.data.attributes;
    log.push({ kind: "refund", accountId, payment_id: a.payment_id, amount: a.amount, reason: a.reason });
    return json(res, 200, { data: { id: id("ref"), type: "refund", attributes: { ...a, status: "pending" } } });
  }

  // --- The hosted checkout page
  if ((m = url.pathname.match(/^\/pay\/([^/]+)$/))) {
    const s = sessions.get(m[1]);
    if (!s) return json(res, 404, {});
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!doctype html><title>Mock PayMongo</title><h1>Pay ₱${s.line_items[0].amount / 100}</h1>
        <p>Status: ${s.status}</p>
        <form method="post"><button name="go" value="1">Pay now</button></form>
        <form method="post" action="?nowebhook=1"><button>Pay now (webhook lost)</button></form>
        <a href="${s.cancel_url}">Back to merchant</a>`);
    }
    if (s.status !== "active") return json(res, 409, { error: "not payable", status: s.status });
    s.status = "paid";
    s.payment = { id: id("pay"), amount: s.line_items[0].amount };
    if (!url.searchParams.has("nowebhook")) {
      const resource = sessionResource(s);
      const r = await sendWebhook(s.accountId, "checkout_session.payment.paid", resource);
      log.push({ kind: "webhook-body", accountId: s.accountId, body: r.body });
    }
    res.writeHead(303, { Location: s.success_url });
    return res.end();
  }
  json(res, 404, { errors: [{ code: "not_found", detail: url.pathname }] });
}).listen(PORT, () => console.log(`mock paymongo on ${PORT}`));
