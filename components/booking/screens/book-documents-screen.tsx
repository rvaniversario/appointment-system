"use client";

import { primaryButton } from "@/lib/booking/ui";

interface BookDocumentsScreenProps {
  documents: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onContinue: () => void;
}

export function BookDocumentsScreen({
  documents,
  onAdd,
  onRemove,
  onContinue,
}: BookDocumentsScreenProps) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 32px 80px" }}>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 26,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 6px",
        }}
      >
        Upload any relevant documents
      </h1>
      <p style={{ fontSize: 15, color: "oklch(0.5 0.01 258)", margin: "0 0 24px" }}>
        Optional — you can also bring documents to your consultation instead.
      </p>

      <div
        onClick={onAdd}
        style={{
          border: "2px dashed oklch(0.8 0.005 90)",
          borderRadius: 12,
          padding: 36,
          textAlign: "center",
          cursor: "pointer",
          marginBottom: 20,
          background: "#fff",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.28 0.05 258)", marginBottom: 4 }}>
          Click to add a document
        </div>
        <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)" }}>
          PDF, DOCX, or image — encrypted on upload
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {documents.map((name, idx) => (
          <div
            key={`${name}-${idx}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#fff",
              border: "1px solid oklch(0.9 0.005 90)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <span style={{ fontSize: 14, color: "oklch(0.32 0.01 258)" }}>{name}</span>
            <button
              onClick={() => onRemove(idx)}
              style={{
                border: "none",
                background: "none",
                color: "oklch(0.55 0.16 25)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button onClick={onContinue} style={{ ...primaryButton, width: "100%" }}>
        Continue →
      </button>
    </div>
  );
}
