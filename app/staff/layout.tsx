import { StaffSessionProvider } from "@/components/staff/staff-session-context";
import { StaffChrome } from "@/components/staff/staff-chrome";

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return (
    <StaffSessionProvider>
      <StaffChrome>{children}</StaffChrome>
    </StaffSessionProvider>
  );
}
