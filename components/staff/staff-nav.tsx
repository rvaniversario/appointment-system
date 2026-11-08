"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { colors } from "@/lib/booking/ui";

const TABS = [
  { key: "calendar", label: "Calendar" },
  { key: "queue", label: "Intake queue" },
  { key: "messages", label: "Messages" },
  { key: "conflicts", label: "Conflict database" },
  { key: "availability", label: "Availability" },
  { key: "analytics", label: "Analytics" },
  { key: "billing", label: "Billing", managerOnly: true },
] as const;

/** The dashboard's side navigation. Billing is hidden from attorneys (and blocked on the server). */
export function StaffNav({ isManager, queueCount }: { isManager: boolean; queueCount: number }) {
  const pathname = usePathname();
  // Appointment pages belong to the queue and calendar; highlight the queue.
  const active = pathname.startsWith("/staff/appointments") ? "queue" : pathname.split("/")[2];

  return (
    <nav aria-label="Staff dashboard" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {TABS.filter((t) => !("managerOnly" in t) || isManager).map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={`/staff/${tab.key}`}
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
            <span>{tab.key === "calendar" && isManager ? "Firm calendar" : tab.label}</span>
            {tab.key === "queue" && queueCount > 0 && <span aria-label={`${queueCount} to review`}>{queueCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
