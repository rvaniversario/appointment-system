import { redirectIfSignedIn } from "@/lib/auth/redirect-if-signed-in";

/** Signed-in users skip the login screens. */
export default async function PortalLoginLayout({ children }: LayoutProps<"/portal/login">) {
  await redirectIfSignedIn();
  return children;
}
