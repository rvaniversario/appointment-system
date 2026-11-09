import "server-only";
import { smsEnv } from "@/lib/env.server";

/**
 * A minimal PhilSMS client (POST /sms/send). Texts go out under our one approved sender ID;
 * the firm's name is in the message itself.
 *
 * PhilSMS has no idempotency key, so a retry after a request that may have reached them could
 * text twice. Only failures where nothing was sent are retried: the connection never opened,
 * a rate limit, or a gateway error. A timeout is final.
 */
export class SmsError extends Error {
  constructor(
    readonly status: number,
    detail: string,
    /** True when the provider certainly didn't send it, so it shouldn't count against the cap. */
    readonly notSent: boolean,
  ) {
    super(detail);
    this.name = "SmsError";
  }

  get retryable() {
    return this.notSent && (this.status === 0 || this.status === 429 || this.status >= 500);
  }
}

/** Plain text when every character fits a standard text; otherwise unicode (fewer characters per part). */
export const smsType = (message: string): "plain" | "unicode" => (/^[\x20-\x7E\n]*$/.test(message) ? "plain" : "unicode");

export async function sendSms(input: { to: string; message: string }): Promise<{ id: string }> {
  const env = smsEnv();
  if (!/^639\d{9}$/.test(input.to)) throw new SmsError(422, "not a Philippine mobile number", true);

  let response: Response;
  try {
    response = await fetch(`${env.PHILSMS_API_BASE}/sms/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PHILSMS_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient: input.to, sender_id: env.PHILSMS_SENDER_ID, type: smsType(input.message), message: input.message }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timedOut = (error as Error).name === "TimeoutError";
    throw new SmsError(0, `${timedOut ? "timeout" : "network"}: ${(error as Error).message}`, !timedOut);
  }

  const text = await response.text();
  let json: { status?: string; message?: string; data?: unknown } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error page.
  }
  if (!response.ok || json.status !== "success") {
    const status = response.ok ? 422 : response.status;
    throw new SmsError(status, (json.message ?? `PhilSMS returned ${response.status}`).slice(0, 300), true);
  }
  return { id: messageId(json.data) };
}

/** PhilSMS describes `data` loosely; take the first id-like field it has. */
function messageId(data: unknown): string {
  const pick = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    for (const key of ["uid", "id", "message_id"]) {
      if (typeof record[key] === "string" || typeof record[key] === "number") return String(record[key]);
    }
    return null;
  };
  return (Array.isArray(data) ? pick(data[0]) : pick(data)) ?? "";
}
