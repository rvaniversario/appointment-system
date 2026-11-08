import { initialsOf } from "@/lib/booking/data";

/** An attorney's photo, or their initials until the firm uploads one. */
export function AttorneyPhoto({
  url,
  name,
  height,
  radius = 0,
  marginBottom = 0,
}: {
  url: string | null;
  name: string;
  height: number;
  radius?: number;
  marginBottom?: number;
}) {
  return (
    <div
      role="img"
      aria-label={url ? `Photo of ${name}` : name}
      style={{
        height,
        borderRadius: radius,
        marginBottom,
        background: url ? `center / cover no-repeat url("${url}")` : "oklch(0.94 0.015 258)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!url && (
        <span style={{ fontFamily: "var(--font-lora), serif", fontSize: Math.round(height / 4), fontWeight: 600, color: "oklch(0.45 0.04 258)" }}>
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}
