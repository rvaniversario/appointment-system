"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { initialsOf } from "@/lib/booking/data";
import { Header, type UserMenuData } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { useStaffSession } from "./staff-session-context";
import type { AdminRole } from "@/lib/booking/types";

const PUBLIC_PATHS = ["/staff/login", "/staff/verify"];
const ROLE_LABELS: Record<AdminRole, string> = { attorney: "Attorney", partner: "Super admin" };

export function StaffChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, adminLogout } = useStaffSession();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!PUBLIC_PATHS.includes(pathname) && !state.loggedIn) {
      router.replace("/staff/login");
      return;
    }
    if (pathname === "/staff/billing" && state.role !== "partner") {
      router.replace("/staff/calendar");
    }
  }, [pathname, state.loggedIn, state.role, router]);

  let userMenu: UserMenuData | null = null;
  if (state.loggedIn) {
    const fullName = [state.settings.firstName, state.settings.lastName].filter(Boolean).join(" ");
    const roleName = ROLE_LABELS[state.role];
    const name = fullName || roleName;
    const email = state.settings.email || state.loginEmail || "staff@harlowreyes.com";
    userMenu = {
      name,
      initials: initialsOf(name),
      email,
      isClient: false,
      photo: state.settings.photo,
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
      <Footer onOpenAdmin={() => router.push("/staff/login")} />
    </div>
  );
}
