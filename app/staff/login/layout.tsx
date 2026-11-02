import { redirectIfSignedIn } from "@/lib/auth/redirect-if-signed-in";

/** Signed-in users skip the login screens. */
export default async function StaffLoginLayout({ children }: LayoutProps<"/staff/login">) {
  await redirectIfSignedIn();
  return children;
}
