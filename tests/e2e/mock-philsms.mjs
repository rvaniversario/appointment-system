// A local stand-in for PhilSMS's POST /api/v3/sms/send, for end-to-end tests without sending
// real texts. Test-only endpoints: GET /_sms lists what was sent, POST /_fail?count=N&status=S
// makes the next N sends fail with HTTP status S (default 500), DELETE /_sms clears the list.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const PORT = 4030;
const texts = [];
let failNext = 0;
let failStatus = 500;

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;

  if (url.pathname === "/_sms" && req.method === "GET") return json(res, 200, texts);
  if (url.pathname === "/_sms" && req.method === "DELETE") {
    texts.length = 0;
    return json(res, 200, {});
  }
  if (url.pathname === "/_fail" && req.method === "POST") {
    failNext = Number(url.searchParams.get("count") ?? 1);
    failStatus = Number(url.searchParams.get("status") ?? 500);
    return json(res, 200, {});
  }

  if (url.pathname === "/api/v3/sms/send" && req.method === "POST") {
    if (req.headers.authorization !== "Bearer philsms-mock-token") return json(res, 401, { status: "error", message: "Unauthenticated." });
    if (failNext > 0) {
      failNext--;
      return json(res, failStatus, { status: "error", message: "Mock failure" });
    }
    const body = JSON.parse(raw || "{}");
    if (!/^639\d{9}$/.test(body.recipient ?? "") || !body.sender_id || !["plain", "unicode"].includes(body.type) || !body.message) {
      return json(res, 200, { status: "error", message: "Invalid request" });
    }
    const uid = randomUUID();
    texts.push({ uid, to: body.recipient, sender_id: body.sender_id, type: body.type, message: body.message });
    return json(res, 200, { status: "success", data: { uid, to: body.recipient, status: "Delivered" } });
  }

  json(res, 404, { status: "error", message: `No mock for ${req.method} ${url.pathname}` });
}).listen(PORT, () => console.log(`mock PhilSMS on :${PORT}`));
