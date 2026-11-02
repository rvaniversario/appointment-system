import { redirectIfSignedIn } from "@/lib/auth/redirect-if-signed-in";

/** Signed-in users skip the login screens. */
export default async function PortalVerifyLayout({ children }: LayoutProps<"/portal/verify">) {
  await redirectIfSignedIn();
  return children;
}
