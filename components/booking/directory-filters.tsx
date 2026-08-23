"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LANGUAGES, LOCATIONS, PRACTICE_AREAS, getFirstAvailable } from "@/lib/booking/data";

interface DirectoryFiltersProps {
  practiceArea: string;
  language: string;
  location: string;
}

const selectStyle = {
  padding: "9px 10px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  background: "#fff",
} as const;

function buildHref(filters: DirectoryFiltersProps): string {
  const params = new URLSearchParams();
  if (filters.practiceArea) params.set("practiceArea", filters.practiceArea);
  if (filters.language) params.set("language", filters.language);
  if (filters.location) params.set("location", filters.location);
  const qs = params.toString();
  return qs ? `/attorneys?${qs}` : "/attorneys";
}

export function DirectoryFilters({ practiceArea, language, location }: DirectoryFiltersProps) {
  const router = useRouter();
  const firstAvailable = getFirstAvailable();

  const updateFilter = (patch: Partial<DirectoryFiltersProps>) => {
    router.push(buildHref({ practiceArea, language, location, ...patch }));
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "flex-end",
        background: "#fff",
        border: "1px solid oklch(0.9 0.005 90)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 170 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.4 0.01 258)" }}>
          Practice area
        </label>
        <select
          value={practiceArea}
          onChange={(e) => updateFilter({ practiceArea: e.target.value })}
          style={selectStyle}
        >
          <option value="">Any practice area</option>
          {PRACTICE_AREAS.map((pa) => (
            <option key={pa} value={pa}>
              {pa}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 150 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.4 0.01 258)" }}>
          Language
        </label>
        <select
          value={language}
          onChange={(e) => updateFilter({ language: e.target.value })}
          style={selectStyle}
        >
          <option value="">Any language</option>
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 170 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.4 0.01 258)" }}>
          Office
        </label>
        <select
          value={location}
          onChange={(e) => updateFilter({ location: e.target.value })}
          style={selectStyle}
        >
          <option value="">Any location</option>
          {LOCATIONS.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>
      <Link
        href="/attorneys"
        style={{
          padding: "9px 14px",
          border: "1px solid oklch(0.85 0.005 90)",
          borderRadius: 7,
          background: "#fff",
          fontSize: 14,
          color: "oklch(0.45 0.01 258)",
          cursor: "pointer",
          textDecoration: "none",
        }}
      >
        Clear filters
      </Link>
      <div style={{ flex: 1 }} />
      <Link
        href={firstAvailable ? `/book?attorney=${firstAvailable.attorneyId}` : "/attorneys"}
        style={{
          padding: "11px 18px",
          border: "none",
          borderRadius: 7,
          background: "oklch(0.28 0.05 258)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          textDecoration: "none",
        }}
      >
        In a hurry? First available →
      </Link>
    </div>
  );
}
