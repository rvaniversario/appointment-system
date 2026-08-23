"use client";

import { useRouter } from "next/navigation";
import { Header } from "@/components/booking/header";
import { Footer } from "@/components/booking/footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <>
      <Header
        onGoHome={() => router.push("/")}
        stepper={null}
        userMenu={null}
        userMenuOpen={false}
        onToggleUserMenu={() => {}}
        showBackLink
        onOpenPortal={() => router.push("/book?screen=portal-login")}
      />
      <main style={{ flex: 1, width: "100%" }}>{children}</main>
      <Footer onOpenAdmin={() => router.push("/book?screen=admin-login")} />
    </>
  );
}
