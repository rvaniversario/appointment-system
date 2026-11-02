import { PortalSessionProvider } from "@/components/portal/portal-session-context";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { getSessionAccount } from "@/lib/auth/session";

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const session = await getSessionAccount();
  const account =
    session && session.role === "client"
      ? { email: session.email, firstName: session.firstName, lastName: session.lastName }
      : null;

  return (
    <PortalSessionProvider account={account}>
      <PortalChrome>{children}</PortalChrome>
    </PortalSessionProvider>
  );
}
