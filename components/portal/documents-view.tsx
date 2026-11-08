"use client";

import { useRef, useState, useTransition } from "react";
import { DOCUMENT_ACCEPT, DOCUMENTS_BUCKET } from "@/lib/documents/rules";
import { confirmDocumentUpload, createDocumentUpload, getDocumentDownloadUrl } from "@/lib/portal/actions";
import type { PortalDocument, PortalFirm } from "@/lib/portal/types";
import { createClient } from "@/lib/supabase/client";
import { card, colors, errorTextStyle, pageHeading, secondaryButton } from "@/lib/booking/ui";

export function DocumentsView({ documents, firms }: { documents: PortalDocument[]; firms: PortalFirm[] }) {
  const [firmId, setFirmId] = useState(firms[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (files: File[]) =>
    startUpload(async () => {
      setNotice(null);
      const supabase = createClient();
      for (const file of files) {
        const url = await createDocumentUpload({ firmId, fileName: file.name, size: file.size, mimeType: file.type });
        if (!url.ok) {
          setNotice(`${file.name}: ${url.error}`);
          continue;
        }
        const { error } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .uploadToSignedUrl(url.path, url.token, file, { contentType: file.type });
        if (error) {
          setNotice(`${file.name} couldn't be uploaded. Please try again.`);
          continue;
        }
        const saved = await confirmDocumentUpload({ path: url.path, fileName: file.name });
        if (!saved.ok) setNotice(`${file.name}: ${saved.error}`);
      }
    });

  const download = async (id: string) => {
    setDownloading(id);
    const result = await getDocumentDownloadUrl({ documentId: id });
    setDownloading(null);
    if (result.ok) window.location.assign(result.url);
    else setNotice(result.error);
  };

  return (
    <div>
      <h2 style={pageHeading}>Documents</h2>

      {firms.length > 0 ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {firms.length > 1 && (
            <label style={{ fontSize: 13.5, color: "oklch(0.4 0.01 258)" }}>
              Send to{" "}
              <select
                value={firmId}
                onChange={(e) => setFirmId(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid oklch(0.85 0.005 90)", borderRadius: 7, fontSize: 13.5, background: "#fff" }}
              >
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={secondaryButton}>
            {uploading ? "Uploading…" : "+ Upload document"}
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={DOCUMENT_ACCEPT}
            aria-label="Upload document"
            style={{ display: "none" }}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) upload(files);
            }}
          />
        </div>
      ) : null}
      <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginBottom: 16 }}>
        {firms.length === 1 ? `Shared with ${firms[0].name}. ` : firms.length > 1 ? "Each document is shared only with the firm you choose. " : ""}
        PDF, Word (.docx), JPG or PNG, up to 10 MB each.
      </div>

      {notice && (
        <div role="alert" style={{ ...errorTextStyle, marginBottom: 12 }}>
          {notice}
        </div>
      )}

      {documents.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>
          {firms.length ? "No documents yet." : "Once you've booked a consultation, you can share documents with the firm here."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {documents.map((doc) => (
            <div
              key={doc.id}
              style={{
                ...card("12px 16px"),
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: colors.ink, overflowWrap: "anywhere" }}>{doc.fileName}</div>
                <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
                  {doc.firmName} · {doc.addedLabel} · {doc.sizeLabel}
                  {doc.fromFirm ? " · Added by the firm" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => download(doc.id)}
                disabled={downloading === doc.id}
                style={{ border: "none", background: "none", color: colors.green, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {downloading === doc.id ? "Opening…" : "Download"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
