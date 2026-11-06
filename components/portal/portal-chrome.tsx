"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { initialsOf } from "@/lib/booking/data";
import { Header, type UserMenuData } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { usePortalSession } from "./portal-session-context";

export function PortalChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { account, portalLogout } = usePortalSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  let userMenu: UserMenuData | null = null;
  // Route protection happens on the server (app/portal/(account)/layout.tsx).
  if (account) {
    const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ");
    const name = fullName || "Client Account";
    const email = account.email;
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: true,
      photo: account.photoUrl,
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
      <Footer signedIn={Boolean(account)} onOpenAdmin={() => router.push("/staff/login")} />
    </div>
  );
}
