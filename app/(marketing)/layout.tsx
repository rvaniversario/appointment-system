"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";
import { useHeaderUserMenu } from "@/components/auth/use-header-user-menu";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { userMenu, userMenuOpen, toggleUserMenu } = useHeaderUserMenu();

  return (
    <>
      <Header
        onGoHome={() => router.push("/")}
        stepper={null}
        userMenu={userMenu}
        userMenuOpen={userMenuOpen}
        onToggleUserMenu={toggleUserMenu}
        showBackLink
        onOpenPortal={() => router.push("/portal/login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer signedIn={Boolean(userMenu)} onOpenAdmin={() => router.push("/staff/login")} />
    </>
  );
}
