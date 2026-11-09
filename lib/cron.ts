import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env.server";

/** True when the request carries "Authorization: Bearer $CRON_SECRET". */
export function isCronRequest(request: Request): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
