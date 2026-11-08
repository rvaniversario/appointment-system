import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie on every matched request and does an
 * optimistic redirect for signed-out visitors. This is NOT the authorization layer:
 * pages check access with requireClient/requireStaff, and RLS enforces it in the DB.
 */
const PUBLIC_PORTAL = ["/portal/login", "/portal/verify"];
const PUBLIC_STAFF = ["/staff/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Do not run code between createServerClient and getClaims (session refresh).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn) {
    if (pathname.startsWith("/portal") && !PUBLIC_PORTAL.includes(pathname)) return redirectTo("/portal/login");
    if (pathname.startsWith("/staff") && !PUBLIC_STAFF.includes(pathname)) return redirectTo("/staff/login");
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/staff/:path*", "/f/:path*"],
};
