"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors } from "@/lib/booking/ui";

interface Tab {
  key: string;
  label: string;
  href: string;
}

/** The dashboard's side navigation. Manager-only pages are hidden from attorneys and blocked on the server. */
export function StaffNav({
  isManager,
  queueCount,
  ownAttorneyId,
}: {
  isManager: boolean;
  queueCount: number;
  /** The attorney profile linked to this account, for "Your profile". */
  ownAttorneyId: string | null;
}) {
  const pathname = usePathname();
  const tabs: Tab[] = [
    { key: "calendar", label: isManager ? "Firm calendar" : "Calendar", href: "/staff/calendar" },
    { key: "queue", label: "Intake queue", href: "/staff/queue" },
    { key: "messages", label: "Messages", href: "/staff/messages" },
    { key: "conflicts", label: "Conflict database", href: "/staff/conflicts" },
    { key: "availability", label: "Availability", href: "/staff/availability" },
    { key: "analytics", label: "Analytics", href: "/staff/analytics" },
  ];
  if (isManager) {
    tabs.push({ key: "billing", label: "Billing", href: "/staff/billing" });
    tabs.push({ key: "firm", label: "Firm settings", href: "/staff/firm" });
  } else if (ownAttorneyId) {
    tabs.push({ key: "firm", label: "Your profile", href: `/staff/firm/attorneys/${ownAttorneyId}` });
  }

  // Appointment pages belong to the queue.
  const active = pathname.startsWith("/staff/appointments") ? "queue" : pathname.split("/")[2];

  return (
    <nav aria-label="Staff dashboard" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 14.5,
              fontWeight: 600,
              background: isActive ? colors.navy : "transparent",
              color: isActive ? "#fff" : "oklch(0.4 0.01 258)",
              textDecoration: "none",
            }}
          >
            <span>{tab.label}</span>
            {tab.key === "queue" && queueCount > 0 && <span aria-label={`${queueCount} to review`}>{queueCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
