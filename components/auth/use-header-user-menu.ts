"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { initialsOf } from "@/lib/booking/data";
import { signOut } from "@/app/portal/actions";
import type { UserMenuData } from "@/components/booking/header";

interface HeaderAccount {
  email: string;
  name: string;
  isClient: boolean;
}

/**
 * Signed-in user menu for the public pages (home, directory, booking wizard).
 * Loaded in the browser so those pages can stay statically rendered. Display only:
 * access control lives in the portal/staff layouts and RLS.
 */
export function useHeaderUserMenu() {
  const router = useRouter();
  const [account, setAccount] = useState<HeaderAccount | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims;
      if (!claims?.sub) {
        if (active) setAccount(null);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, role, first_name, last_name")
        .eq("id", claims.sub)
        .single();
      if (!active) return;
      if (!profile) {
        setAccount(null);
        return;
      }
      const isClient = profile.role === "client";
      // Staff only count as signed in after completing two-factor authentication.
      if (!isClient && claims.aal !== "aal2") {
        setAccount(null);
        return;
      }
      const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
      setAccount({
        email: profile.email,
        name: fullName || (isClient ? "Client Account" : "Staff Account"),
        isClient,
      });
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  const userMenu: UserMenuData | null = account
    ? {
        name: account.name,
        initials: initialsOf(account.name),
        email: account.email,
        isClient: account.isClient,
        photo: null,
        onLogout: () => startTransition(() => signOut()),
        onSettings: () => go(account.isClient ? "/portal/settings" : "/staff/settings"),
        onAppointments: () => go("/portal/appointments"),
        onMessages: () => go("/portal/messages"),
        onDocuments: () => go("/portal/documents"),
      }
    : null;

  return { userMenu, userMenuOpen: open, toggleUserMenu: () => setOpen((v) => !v) };
}
