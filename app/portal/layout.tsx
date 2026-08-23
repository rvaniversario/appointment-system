import { PortalSessionProvider } from "@/components/portal/portal-session-context";
import { PortalChrome } from "@/components/portal/portal-chrome";

export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <PortalSessionProvider>
      <PortalChrome>{children}</PortalChrome>
    </PortalSessionProvider>
  );
}
