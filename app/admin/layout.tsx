import { PLATFORM } from "@/lib/brand";

export const metadata = {
  title: { default: "Operator", template: `%s | ${PLATFORM.name} operator` },
  robots: { index: false, follow: false },
};

/** Our own operator area. Each page checks access itself (requireOperator). */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div style={{ minHeight: "100vh", fontFamily: "var(--font-public-sans), sans-serif", display: "flex", flexDirection: "column" }}>{children}</div>;
}
