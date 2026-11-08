import { createHmac, timingSafeEqual } from "node:crypto";

/** Reject webhooks signed longer ago than this, to limit replays. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Checks a PayMongo webhook signature. The Paymongo-Signature header looks like
 * "t=<unix seconds>,te=<test signature>,li=<live signature>". The signature is
 * HMAC-SHA256 of "<t>.<raw body>" with the webhook's secret key, hex-encoded. Test-mode
 * events are signed in "te", live-mode events in "li".
 */
export function verifyPaymongoSignature(input: {
  header: string | null;
  rawBody: string;
  secret: string;
  livemode: boolean;
  nowSeconds?: number;
}): boolean {
  if (!input.header) return false;
  const parts = Object.fromEntries(
    input.header.split(",").map((part) => {
      const i = part.indexOf("=");
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const provided = input.livemode ? parts.li : parts.te;
  if (!Number.isFinite(timestamp) || !provided) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", input.secret).update(`${parts.t}.${input.rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Builds a header the way PayMongo does. Used by tests and the local mock server. */
export function signPaymongoPayload(rawBody: string, secret: string, timestamp: number, livemode: boolean): string {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return livemode ? `t=${timestamp},te=,li=${signature}` : `t=${timestamp},te=${signature},li=`;
}
