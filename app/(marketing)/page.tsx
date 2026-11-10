import Link from "next/link";
import { PLATFORM } from "@/lib/brand";

const features = [
  {
    title: "Your own booking page",
    body: "Clients pick an attorney, a consultation type and an open time, any hour of the day.",
  },
  {
    title: "Intake and conflict checks",
    body: "Collect the matter details up front. Possible conflicts are flagged privately for your staff.",
  },
  {
    title: "Documents and agreements",
    body: "Clients upload files securely and sign your consultation agreement before they arrive.",
  },
  {
    title: "Built for Philippine practice",
    body: "Peso pricing, Philippine time, IBP roll numbers and Data Privacy Act consent built in.",
  },
];

/** The product's own home page, for law firms. Each firm's clients use /f/<firm>. */
export default function Home() {
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
          Online consultation booking for law firms.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.65, color: "oklch(0.45 0.01 258)", margin: 0 }}>
          {PLATFORM.name} gives your firm a booking page where clients schedule consultations, complete
          their intake and share documents — confidentially, and without the back-and-forth.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20, marginBottom: 48 }}>
        {features.map((f) => (
          <div
            key={f.title}
            style={{ background: "#fff", border: "1px solid oklch(0.9 0.005 90)", borderRadius: 14, padding: "24px 22px" }}
          >
            <div
              style={{
                fontFamily: "var(--font-lora), serif",
                fontSize: 18,
                fontWeight: 600,
                color: "oklch(0.25 0.01 258)",
                marginBottom: 8,
              }}
            >
              {f.title}
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "oklch(0.5 0.01 258)" }}>{f.body}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/signup"
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "oklch(0.5 0.08 150)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Sign up your firm
        </Link>
        <Link
          href="/staff/login"
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            background: "oklch(0.28 0.05 258)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Firm sign-in
        </Link>
        <Link
          href="/portal/login"
          style={{
            padding: "12px 20px",
            borderRadius: 8,
            border: "1px solid oklch(0.85 0.005 90)",
            background: "#fff",
            color: "oklch(0.28 0.05 258)",
            fontSize: 15,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Client portal
        </Link>
      </div>
      <p style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", marginTop: 18 }}>
        Looking for a lawyer? Use the booking link your firm gave you.
      </p>
    </div>
  );
}
