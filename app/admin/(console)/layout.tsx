import Link from "next/link";
import { requireOperator } from "@/lib/admin/auth";
import { operatorSignOut } from "@/lib/admin/auth-actions";
import { PLATFORM } from "@/lib/brand";
import { colors } from "@/lib/booking/ui";

const navLink = { fontSize: 14, fontWeight: 600, color: "#fff", textDecoration: "none", opacity: 0.9 } as const;

/** Operator console. Shows firm-level data only, never a firm's clients. */
export default async function OperatorConsoleLayout({ children }: LayoutProps<"/admin">) {
  const account = await requireOperator();
  return (
    <>
      <header style={{ background: colors.navy, color: "#fff" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 22px" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{PLATFORM.name} · Operator</span>
          <nav aria-label="Operator" style={{ display: "flex", gap: 18 }}>
            <Link href="/admin/firms" style={navLink}>
              Firms
            </Link>
            <Link href="/admin/audit" style={navLink}>
              Audit log
            </Link>
          </nav>
          <form action={operatorSignOut} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ opacity: 0.8 }}>{account.email}</span>
            <button type="submit" style={{ background: "none", border: "1px solid rgba(255,255,255,0.5)", color: "#fff", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: 1120, margin: "0 auto", padding: "28px 16px 80px", boxSizing: "border-box" }}>{children}</main>
    </>
  );
}
