import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing route for links in Supabase auth emails (sign-in link, email change).
 * Handles both link styles:
 *   - token_hash + type  (custom template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email)
 *   - code               (default template / PKCE: Supabase redirects here with ?code=)
 * `next` must be a same-site path, so the link can't become an open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/portal/appointments";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/portal/appointments";

  const supabase = await createClient();
  let ok = false;

  // Email change links (one to each address). Until both are opened, Supabase accepts the
  // first without starting a session, which is how the two steps are told apart.
  if (tokenHash && type === "email_change") {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    const status = error ? "failed" : data.session ? "done" : "partial";
    if (error) console.error("[auth] email change link failed", { status: error.status, code: error.code });
    const target = request.nextUrl.clone();
    target.pathname = "/portal/email-changed";
    target.search = `?status=${status}`;
    return NextResponse.redirect(target);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const target = request.nextUrl.clone();
  target.search = "";
  target.pathname = ok ? next : "/portal/login";
  if (!ok) target.searchParams.set("error", "link");
  return NextResponse.redirect(target);
}
