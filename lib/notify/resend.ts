import "server-only";
import { emailEnv } from "@/lib/env.server";

/**
 * A minimal Resend client (POST /emails). Every email goes out from our verified domain with
 * the firm's name in front, so clients see who it's from while SPF/DKIM stay ours.
 */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail);
    this.name = "ResendError";
  }

  /** Rate limits, server errors and network failures are worth retrying; bad requests aren't. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutgoingEmail {
  fromName: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  /** Resend ignores a repeat with the same key for 24 hours, so a retry can't send twice. */
  idempotencyKey: string;
}

/** Display names can't carry quotes, angle brackets or line breaks into the From header. */
export function fromHeader(name: string, address: string): string {
  const clean = name.replace(/[\r\n]/g, " ").replace(/["<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
  return clean ? `"${clean}" <${address}>` : address;
}

export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const env = emailEnv();
  let response: Response;
  try {
    response = await fetch(`${env.RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: fromHeader(email.fromName, env.EMAIL_FROM),
        to: [email.to],
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.from(a.content, "utf8").toString("base64"),
                content_type: a.contentType,
              })),
            }
          : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new ResendError(0, `network: ${(error as Error).message}`);
  }

  const text = await response.text();
  let json: { id?: string; message?: string; name?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error page.
  }
  if (!response.ok) throw new ResendError(response.status, json.message ?? json.name ?? `Resend returned ${response.status}`);
  if (!json.id) throw new ResendError(502, "Resend returned no message id");
  return { id: json.id };
}
