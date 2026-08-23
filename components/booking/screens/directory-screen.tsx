"use client";

import { LANGUAGES, LOCATIONS, PRACTICE_AREAS } from "@/lib/booking/data";
import type { Attorney } from "@/lib/booking/types";

interface DirectoryFilters {
  practiceArea: string;
  language: string;
  location: string;
}

interface DirectoryScreenProps {
  filters: DirectoryFilters;
  onFilterChange: (patch: Partial<DirectoryFilters>) => void;
  onResetFilters: () => void;
  onFirstAvailable: () => void;
  attorneys: Attorney[];
  onView: (id: string) => void;
  onBook: (id: string) => void;
}

const selectStyle = {
  padding: "9px 10px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  background: "#fff",
} as const;

export function DirectoryScreen({
  filters,
  onFilterChange,
  onResetFilters,
  onFirstAvailable,
  attorneys,
  onView,
  onBook,
}: DirectoryScreenProps) {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div style={{ maxWidth: 640, marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: "var(--font-lora), serif",
            fontSize: 34,
            fontWeight: 600,
            color: "oklch(0.28 0.05 258)",
            margin: "0 0 10px",
            lineHeight: 1.2,
          }}
        >
          Find the right attorney for your situation
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "oklch(0.45 0.01 258)", margin: 0 }}>
          Tell us a little about what&apos;s going on. Every conversation is confidential, and
          your information is encrypted from the moment you submit it.
        </p>
      </div>

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
            value={filters.practiceArea}
            onChange={(e) => onFilterChange({ practiceArea: e.target.value })}
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
            value={filters.language}
            onChange={(e) => onFilterChange({ language: e.target.value })}
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
            value={filters.location}
            onChange={(e) => onFilterChange({ location: e.target.value })}
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
        <button
          onClick={onResetFilters}
          style={{
            padding: "9px 14px",
            border: "1px solid oklch(0.85 0.005 90)",
            borderRadius: 7,
            background: "#fff",
            fontSize: 14,
            color: "oklch(0.45 0.01 258)",
            cursor: "pointer",
          }}
        >
          Clear filters
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onFirstAvailable}
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
          }}
        >
          In a hurry? First available →
        </button>
      </div>

      <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginBottom: 20 }}>
        {attorneys.length} {attorneys.length === 1 ? "attorney matches" : "attorneys match"} your
        filters
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
          gap: 20,
        }}
      >
        {attorneys.map((a) => (
          <div
            key={a.id}
            style={{
              background: "#fff",
              border: "1px solid oklch(0.9 0.005 90)",
              borderRadius: 14,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                height: 150,
                background:
                  "repeating-linear-gradient(135deg, oklch(0.93 0.01 258), oklch(0.93 0.01 258) 12px, oklch(0.97 0.005 90) 12px, oklch(0.97 0.005 90) 24px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "oklch(0.5 0.01 258)",
                  background: "#fff",
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                attorney photo
              </span>
            </div>
            <div
              style={{
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                flex: 1,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-lora), serif",
                    fontWeight: 600,
                    fontSize: 18,
                    color: "oklch(0.25 0.01 258)",
                  }}
                >
                  {a.name}
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
                  {a.location}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {a.practiceAreas.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 11.5,
                      padding: "4px 9px",
                      borderRadius: 20,
                      background: "oklch(0.95 0.02 150)",
                      color: "oklch(0.4 0.07 150)",
                      fontWeight: 600,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "oklch(0.5 0.01 258)" }}>
                Speaks {a.languages.join(", ")}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button
                  onClick={() => onView(a.id)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    border: "1px solid oklch(0.85 0.005 90)",
                    borderRadius: 7,
                    background: "#fff",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "oklch(0.28 0.05 258)",
                    cursor: "pointer",
                  }}
                >
                  View profile
                </button>
                <button
                  onClick={() => onBook(a.id)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    border: "none",
                    borderRadius: 7,
                    background: "oklch(0.28 0.05 258)",
                    color: "#fff",
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Book
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {attorneys.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "oklch(0.55 0.01 258)" }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            No attorneys match those filters right now.
          </div>
          <button
            onClick={onResetFilters}
            style={{
              padding: "9px 16px",
              border: "1px solid oklch(0.85 0.005 90)",
              borderRadius: 7,
              background: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
