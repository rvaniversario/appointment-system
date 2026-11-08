import Link from "next/link";
import type { ReactNode } from "react";
import { colors } from "@/lib/booking/ui";

const TABS = [
  { key: "appointments", label: "Appointments" },
  { key: "messages", label: "Messages" },
  { key: "documents", label: "Documents" },
  { key: "settings", label: "Settings" },
] as const;

export type PortalTabKey = (typeof TABS)[number]["key"];

/** The frame of every signed-in portal page. */
export function PortalPage({ active, unread = 0, children }: { active: PortalTabKey; unread?: number; children: ReactNode }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 32px 80px" }}>
      <nav aria-label="Portal" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24 }}>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={`/portal/${tab.key}`}
              aria-current={isActive ? "page" : undefined}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                background: isActive ? colors.navy : "transparent",
                color: isActive ? "#fff" : "oklch(0.4 0.01 258)",
              }}
            >
              {tab.label}
              {tab.key === "messages" && unread > 0 ? ` (${unread})` : ""}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
