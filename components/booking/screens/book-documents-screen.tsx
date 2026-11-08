"use client";

import { useRef } from "react";
import type { UploadedFile } from "@/lib/booking/types";
import { errorTextStyle, primaryButtonDisabled } from "@/lib/booking/ui";

interface BookDocumentsScreenProps {
  documents: UploadedFile[];
  notice: string | null;
  pending: boolean;
  onUpload: (files: FileList) => void;
  onRemove: (id: string) => void;
  onContinue: () => void;
}

const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

export function BookDocumentsScreen({ documents, notice, pending, onUpload, onRemove, onContinue }: BookDocumentsScreenProps) {
  const input = useRef<HTMLInputElement>(null);

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

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onUpload(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        style={{
          display: "block",
          width: "100%",
          border: "2px dashed oklch(0.8 0.005 90)",
          borderRadius: 12,
          padding: 36,
          textAlign: "center",
          cursor: pending ? "wait" : "pointer",
          marginBottom: 20,
          background: "#fff",
          font: "inherit",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "oklch(0.28 0.05 258)", marginBottom: 4 }}>
          {pending ? "Uploading…" : "Click to add documents"}
        </div>
        <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)" }}>
          PDF, Word (.docx), JPG or PNG, up to 10 MB each. Only this firm can see them.
        </div>
      </button>

      {notice && (
        <div role="alert" style={{ ...errorTextStyle, fontSize: 14, marginBottom: 16 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {documents.map((doc) => (
          <div
            key={doc.id}
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
            <span style={{ fontSize: 14, color: "oklch(0.32 0.01 258)" }}>{doc.name}</span>
            <button
              onClick={() => onRemove(doc.id)}
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

      <button disabled={pending} onClick={onContinue} style={primaryButtonDisabled(pending)}>
        Continue →
      </button>
    </div>
  );
}
