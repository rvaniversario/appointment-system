"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors } from "@/lib/booking/ui";

const SECTIONS = [
  { href: "/staff/firm", label: "Firm & policies" },
  { href: "/staff/firm/consultations", label: "Consultations" },
  { href: "/staff/firm/offices", label: "Offices" },
  { href: "/staff/firm/attorneys", label: "Attorneys" },
  { href: "/staff/firm/staff", label: "Staff" },
];

export function FirmSettingsNav() {
  const pathname = usePathname();
  const active = [...SECTIONS].reverse().find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href;
  return (
    <nav aria-label="Firm settings" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 22, borderBottom: "1px solid oklch(0.92 0.005 90)" }}>
      {SECTIONS.map((s) => {
        const isActive = s.href === active;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={isActive ? "page" : undefined}
            style={{
              padding: "8px 12px",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
              color: isActive ? colors.navy : "oklch(0.5 0.01 258)",
              borderBottom: `2px solid ${isActive ? colors.navy : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
