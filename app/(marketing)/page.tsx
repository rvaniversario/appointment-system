import Link from "next/link";
import { PRACTICE_AREAS, getFirstAvailable } from "@/lib/booking/data";

export default function Home() {
  const firstAvailable = getFirstAvailable();

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 32px 90px" }}>
      <div style={{ maxWidth: 680, marginBottom: 44 }}>
        <h1
          style={{
            fontFamily: "var(--font-lora), serif",
            fontSize: 42,
            fontWeight: 600,
            color: "oklch(0.25 0.01 258)",
            margin: "0 0 16px",
            lineHeight: 1.2,
          }}
        >
          Legal help, without the wait.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, color: "oklch(0.45 0.01 258)", margin: 0 }}>
          Find the right attorney at Harlow &amp; Reyes and book a consultation online — day or
          night. Every submission is encrypted and confidential.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 56 }}>
        <Link
          href="/attorneys"
          style={{
            display: "block",
            background: "#fff",
            border: "1px solid oklch(0.9 0.005 90)",
            borderRadius: 14,
            padding: "28px 26px",
            cursor: "pointer",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 19,
              fontWeight: 600,
              color: "oklch(0.25 0.01 258)",
              marginBottom: 8,
            }}
          >
            Find an Attorney
          </div>
          <div
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "oklch(0.5 0.01 258)",
              marginBottom: 16,
            }}
          >
            Browse by practice area, language, and location, and pick who you&apos;d like to meet
            with.
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.5 0.08 150)" }}>
            Browse attorneys →
          </div>
        </Link>

        <Link
          href={firstAvailable ? `/book/${firstAvailable.attorneyId}/time` : "/attorneys"}
          style={{
            display: "block",
            background: "oklch(0.28 0.05 258)",
            borderRadius: 14,
            padding: "28px 26px",
            cursor: "pointer",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-lora), serif",
              fontSize: 19,
              fontWeight: 600,
              color: "#fff",
              marginBottom: 8,
            }}
          >
            In a hurry?
          </div>
          <div
            style={{
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "oklch(0.85 0.02 258)",
              marginBottom: 16,
            }}
          >
            Skip the search — we&apos;ll match you with the first available attorney for your
            situation.
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.85 0.09 85)" }}>
            Get matched now →
          </div>
        </Link>
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "oklch(0.4 0.01 258)",
          marginBottom: 14,
        }}
      >
        Or jump straight to a practice area
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {PRACTICE_AREAS.map((pa) => (
          <Link
            key={pa}
            href={`/attorneys?practiceArea=${encodeURIComponent(pa)}`}
            style={{
              padding: "10px 18px",
              border: "1px solid oklch(0.85 0.005 90)",
              borderRadius: 20,
              background: "#fff",
              fontSize: 14,
              fontWeight: 600,
              color: "oklch(0.32 0.01 258)",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            {pa}
          </Link>
        ))}
      </div>
    </div>
  );
}
