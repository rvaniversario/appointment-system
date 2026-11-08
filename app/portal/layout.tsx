import { PortalSessionProvider } from "@/components/portal/portal-session-context";
import { PortalChrome } from "@/components/portal/portal-chrome";
import { getSessionAccount, toAccountProfile } from "@/lib/auth/session";

export const metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const session = await getSessionAccount();
  const account = session ? await toAccountProfile(session) : null;

  return (
    <PortalSessionProvider account={account}>
      <PortalChrome>{children}</PortalChrome>
    </PortalSessionProvider>
  );
}
