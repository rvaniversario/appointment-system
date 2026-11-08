import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DirectoryFilters } from "@/components/booking/directory-filters";
import { getPublicFirm, listFirmAttorneys } from "@/lib/booking/queries";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** A firm's attorney directory. A solo practitioner's firm goes straight to their profile. */
export default async function FirmDirectoryPage(props: PageProps<"/f/[firmSlug]">) {
  const [{ firmSlug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const firm = await getPublicFirm(firmSlug);
  if (!firm) notFound();

  const all = await listFirmAttorneys(firm.id);
  if (all.length === 1) redirect(`/f/${firm.slug}/attorneys/${all[0].slug}`);

  const basePath = `/f/${firm.slug}`;
  const practiceArea = firstParam(searchParams.practiceArea);
  const language = firstParam(searchParams.language);
  const location = firstParam(searchParams.location);
  const options = {
    practiceAreas: unique(all.flatMap((a) => a.practiceAreas)),
    languages: unique(all.flatMap((a) => a.languages)),
    locations: unique(all.map((a) => a.location)),
  };

  const attorneys = all.filter(
    (a) =>
      (!practiceArea || a.practiceAreas.includes(practiceArea)) &&
      (!language || a.languages.includes(language)) &&
      (!location || a.location === location),
  );

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
          Find the right attorney at {firm.name}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: "oklch(0.45 0.01 258)", margin: 0 }}>
          Tell us a little about what&apos;s going on. Every conversation is confidential, and
          your information is encrypted from the moment you submit it.
        </p>
      </div>

      <DirectoryFilters
        basePath={basePath}
        options={options}
        practiceArea={practiceArea}
        language={language}
        location={location}
      />

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
                {a.languages.length > 0 && `Speaks ${a.languages.join(", ")}`}
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <Link
                  href={`${basePath}/attorneys/${a.slug}`}
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
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  View profile
                </Link>
                <Link
                  href={`${basePath}/book/${a.slug}/time`}
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
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  Book
                </Link>
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
          <Link
            href={basePath}
            style={{
              display: "inline-block",
              padding: "9px 16px",
              border: "1px solid oklch(0.85 0.005 90)",
              borderRadius: 7,
              background: "#fff",
              fontSize: 14,
              cursor: "pointer",
              textDecoration: "none",
              color: "oklch(0.32 0.01 258)",
            }}
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
