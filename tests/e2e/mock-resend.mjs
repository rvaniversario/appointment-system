// A local stand-in for Resend's POST /emails, for end-to-end tests without sending real email.
// Test-only endpoints: GET /_emails lists what was sent, POST /_fail?count=N makes the next
// N sends fail with a 500, DELETE /_emails clears the list.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = 4020;
const emails = [];
const byKey = new Map(); // Idempotency-Key -> id
let failNext = 0;

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;

  if (url.pathname === "/_emails" && req.method === "GET") return json(res, 200, emails);
  if (url.pathname === "/_emails" && req.method === "DELETE") {
    emails.length = 0;
    return json(res, 200, {});
  }
  if (url.pathname === "/_fail" && req.method === "POST") {
    failNext = Number(url.searchParams.get("count") ?? 1);
    return json(res, 200, {});
  }

  if (url.pathname === "/emails" && req.method === "POST") {
    if (req.headers.authorization !== "Bearer re_mock") return json(res, 401, { name: "missing_api_key", message: "Invalid API key" });
    if (failNext > 0) {
      failNext--;
      return json(res, 500, { name: "internal_server_error", message: "Mock failure" });
    }
    const body = JSON.parse(raw || "{}");
    if (!body.from || !body.to?.length || !body.subject || !(body.html || body.text)) {
      return json(res, 422, { name: "validation_error", message: "Missing required fields" });
    }
    const key = req.headers["idempotency-key"];
    if (key && byKey.has(key)) return json(res, 200, { id: byKey.get(key) });
    const id = randomUUID();
    if (key) byKey.set(key, id);
    emails.push({
      id,
      from: body.from,
      to: body.to,
      reply_to: body.reply_to ?? null,
      subject: body.subject,
      text: body.text ?? "",
      html: body.html ?? "",
      attachments: (body.attachments ?? []).map((a) => ({
        filename: a.filename,
        content_type: a.content_type,
        content: Buffer.from(a.content, "base64").toString("utf8"),
      })),
    });
    return json(res, 200, { id });
  }

  json(res, 404, { name: "not_found", message: `No mock for ${req.method} ${url.pathname}` });
}).listen(PORT, () => console.log(`mock Resend on :${PORT}`));
