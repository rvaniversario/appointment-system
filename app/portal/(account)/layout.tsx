import { requireClient } from "@/lib/auth/session";

/** Every page in this group requires a signed-in client. */
export default async function PortalAccountLayout({ children }: LayoutProps<"/portal">) {
  await requireClient();
  return children;
}
