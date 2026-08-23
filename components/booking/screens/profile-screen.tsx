"use client";

import type { Attorney } from "@/lib/booking/types";
import { linkButton } from "@/lib/booking/ui";

interface ProfileScreenProps {
  attorney: Attorney;
  onBack: () => void;
  onBook: () => void;
}

export function ProfileScreen({ attorney, onBack, onBook }: ProfileScreenProps) {
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 32px 80px" }}>
      <button
        onClick={onBack}
        style={{ ...linkButton, padding: "0 0 20px", display: "block" }}
      >
        ← Back to attorneys
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 36 }}>
        <div>
          <div
            style={{
              height: 280,
              borderRadius: 14,
              background:
                "repeating-linear-gradient(135deg, oklch(0.93 0.01 258), oklch(0.93 0.01 258) 12px, oklch(0.97 0.005 90) 12px, oklch(0.97 0.005 90) 24px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
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
          <button
            onClick={onBook}
            style={{
              width: "100%",
              padding: "13px 0",
              border: "none",
              borderRadius: 8,
              background: "oklch(0.28 0.05 258)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Book appointment
          </button>
        </div>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 30,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              margin: "0 0 4px",
            }}
          >
            {attorney.name}
          </h1>
          <div style={{ fontSize: 15, color: "oklch(0.55 0.01 258)", marginBottom: 16 }}>
            {attorney.location} · Speaks {attorney.languages.join(", ")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
            {attorney.practiceAreas.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 12.5,
                  padding: "5px 11px",
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
          <h3
            style={{
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "oklch(0.4 0.01 258)",
              margin: "0 0 8px",
            }}
          >
            About
          </h3>
          <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "oklch(0.32 0.01 258)", margin: "0 0 24px" }}>
            {attorney.bio}
          </p>
          <h3
            style={{
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "oklch(0.4 0.01 258)",
              margin: "0 0 8px",
            }}
          >
            Bar admissions
          </h3>
          <p style={{ fontSize: 15, color: "oklch(0.4 0.01 258)", margin: "0 0 24px" }}>
            {attorney.barAdmission}
          </p>
          <div
            style={{
              background: "oklch(0.97 0.01 150)",
              border: "1px solid oklch(0.9 0.03 150)",
              borderRadius: 10,
              padding: "14px 18px",
              fontSize: 14,
              color: "oklch(0.35 0.06 150)",
            }}
          >
            Your information is encrypted and confidential. Nothing you submit is shared outside
            this firm.
          </div>
        </div>
      </div>
    </div>
  );
}
