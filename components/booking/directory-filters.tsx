"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface FilterValues {
  practiceArea: string;
  language: string;
  location: string;
}

interface DirectoryFiltersProps extends FilterValues {
  /** The firm's directory, e.g. /f/santos-law. */
  basePath: string;
  options: { practiceAreas: string[]; languages: string[]; locations: string[] };
}

const selectStyle = {
  padding: "9px 10px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  background: "#fff",
} as const;

function buildHref(basePath: string, filters: FilterValues): string {
  const params = new URLSearchParams();
  if (filters.practiceArea) params.set("practiceArea", filters.practiceArea);
  if (filters.language) params.set("language", filters.language);
  if (filters.location) params.set("location", filters.location);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function DirectoryFilters({ basePath, options, practiceArea, language, location }: DirectoryFiltersProps) {
  const router = useRouter();

  const updateFilter = (patch: Partial<FilterValues>) => {
    router.push(buildHref(basePath, { practiceArea, language, location, ...patch }));
  };

  const select = (labelText: string, value: string, anyLabel: string, values: string[], key: keyof FilterValues, minWidth: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.4 0.01 258)" }}>{labelText}</label>
      <select value={value} onChange={(e) => updateFilter({ [key]: e.target.value })} style={selectStyle}>
        <option value="">{anyLabel}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );

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
      {select("Practice area", practiceArea, "Any practice area", options.practiceAreas, "practiceArea", 170)}
      {select("Language", language, "Any language", options.languages, "language", 150)}
      {options.locations.length > 1 && select("Office", location, "Any location", options.locations, "location", 170)}
      <Link
        href={basePath}
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
        href={`${basePath}/first-available`}
        prefetch={false}
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
