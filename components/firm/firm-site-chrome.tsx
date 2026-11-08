"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { useHeaderUserMenu } from "@/components/auth/use-header-user-menu";
import { firmBrand } from "@/lib/brand";
import type { PublicFirm } from "@/lib/booking/public-types";

/** Header and footer for a firm's directory and attorney profiles. */
export function FirmSiteChrome({ firm, children }: { firm: PublicFirm; children: ReactNode }) {
  const router = useRouter();
  const { userMenu, userMenuOpen, toggleUserMenu } = useHeaderUserMenu();

  return (
    <>
      <Header
        brand={firmBrand(firm)}
        onGoHome={() => router.push(`/f/${firm.slug}`)}
        stepper={null}
        userMenu={userMenu}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={toggleUserMenu}
        showBackLink
        onOpenPortal={() => router.push("/portal/login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer firmName={firm.name} signedIn={Boolean(userMenu)} onOpenAdmin={() => router.push("/staff/login")} />
    </>
  );
}
