"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { initialsOf } from "@/lib/booking/data";
import { Header, type UserMenuData } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { usePortalSession } from "./portal-session-context";

const PUBLIC_PATHS = ["/portal/login", "/portal/verify"];

export function PortalChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, portalLogout } = usePortalSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!PUBLIC_PATHS.includes(pathname) && !state.loggedIn) {
      router.replace("/portal/login");
    }
  }, [pathname, state.loggedIn, router]);

  let userMenu: UserMenuData | null = null;
  if (state.loggedIn) {
    const fullName = [state.settings.firstName, state.settings.lastName].filter(Boolean).join(" ");
    const name = fullName || "Client Account";
    const email = state.settings.email || state.loginEmail || "client@example.com";
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: true,
      photo: state.settings.photo,
      onLogout: portalLogout,
      onSettings: () => router.push("/portal/settings"),
      onAppointments: () => router.push("/portal/appointments"),
      onMessages: () => router.push("/portal/messages"),
      onDocuments: () => router.push("/portal/documents"),
    };
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: "var(--font-public-sans), sans-serif",
        color: "oklch(0.32 0.01 258)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header
        onGoHome={() => router.push("/")}
        stepper={null}
        userMenu={userMenu}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={() => setUserMenuOpen((v) => !v)}
        showBackLink={false}
        onOpenPortal={() => router.push("/portal/login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer onOpenAdmin={() => router.push("/staff/login")} />
    </div>
  );
}
