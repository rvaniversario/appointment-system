"use client";

import { primaryButton } from "@/lib/booking/ui";

interface BookVideoScreenProps {
  dateLabel: string;
  cameraOk: boolean;
  micOk: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onFinish: () => void;
}

function checkDotStyle(ok: boolean) {
  return {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: `2px solid ${ok ? "oklch(0.5 0.08 150)" : "oklch(0.8 0.005 90)"}`,
    background: ok ? "oklch(0.5 0.08 150)" : "transparent",
  } as const;
}

const rowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "#fff",
  border: "1px solid oklch(0.9 0.005 90)",
  borderRadius: 10,
  padding: "16px 18px",
  cursor: "pointer",
} as const;

export function BookVideoScreen({
  dateLabel,
  cameraOk,
  micOk,
  onToggleCamera,
  onToggleMic,
  onFinish,
}: BookVideoScreenProps) {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "36px 32px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        Quick video setup check
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 24px" }}>
        Let&apos;s make sure your camera and microphone are ready before {dateLabel}.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        <div onClick={onToggleCamera} style={rowStyle}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
              Camera
            </div>
            <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)" }}>
              {cameraOk ? "Working" : "Tap to test"}
            </div>
          </div>
          <div style={checkDotStyle(cameraOk)} />
        </div>
        <div onClick={onToggleMic} style={rowStyle}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
              Microphone
            </div>
            <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)" }}>
              {micOk ? "Working" : "Tap to test"}
            </div>
          </div>
          <div style={checkDotStyle(micOk)} />
        </div>
      </div>

      <div style={{ fontSize: 13.5, color: "oklch(0.55 0.01 258)", marginBottom: 20 }}>
        A private video link will be emailed to you 15 minutes before your consultation — no app
        download required.
      </div>

      <button onClick={onFinish} style={{ ...primaryButton, width: "100%" }}>
        Finish setup →
      </button>
    </div>
  );
}
