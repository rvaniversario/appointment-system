"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { initialsOf } from "@/lib/booking/data";
import { Header, type UserMenuData } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { useStaffSession } from "./staff-session-context";
import type { AdminRole } from "@/lib/booking/types";

const ROLE_LABELS: Record<AdminRole, string> = { attorney: "Attorney", partner: "Super admin" };

export function StaffChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { account, adminLogout } = useStaffSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  let userMenu: UserMenuData | null = null;
  // Route protection happens on the server (app/staff/(dashboard)/layout.tsx).
  if (account) {
    const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ");
    const roleName = ROLE_LABELS[account.role];
    const name = fullName || roleName;
    const email = account.email;
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: false,
      photo: account.photoUrl,
      onLogout: adminLogout,
      onSettings: () => router.push("/staff/settings"),
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
