"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_ACCEPT, DOCUMENTS_BUCKET } from "@/lib/documents/rules";
import {
  confirmStaffDocumentUpload,
  createStaffDocumentUpload,
  getStaffDocumentUrl,
  recordOutcome,
  setMeetingUrl,
  startThread,
} from "@/lib/staff/actions";
import type { StaffDocumentView } from "@/lib/staff/types";
import { createClient } from "@/lib/supabase/client";
import { colors, errorTextStyle, secondaryButton } from "@/lib/booking/ui";

const smallButton = { ...secondaryButton, fontSize: 13.5, padding: "8px 14px" } as const;
const inputStyle = {
  flex: 1,
  minWidth: 220,
  padding: "8px 12px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
} as const;

export function MeetingLinkForm({ appointmentId, url }: { appointmentId: string; url: string | null }) {
  const [value, setValue] = useState(url ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await setMeetingUrl({ appointmentId, url: value });
          setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
        });
      }}
      style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
    >
      <input
        aria-label="Meeting link"
        type="url"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        placeholder="https://zoom.us/j/…"
        style={inputStyle}
      />
      <button type="submit" disabled={pending} style={smallButton}>
        {pending ? "Saving…" : "Save link"}
      </button>
      {message && (
        <span role={message.ok ? "status" : "alert"} style={message.ok ? { fontSize: 13, color: colors.green } : errorTextStyle}>
          {message.text}
        </span>
      )}
    </form>
  );
}

export function OutcomeButtons({ appointmentId, status }: { appointmentId: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choose = (outcome: "completed" | "no_show") =>
    start(async () => {
      const result = await recordOutcome({ appointmentId, outcome });
      setError(result.ok ? null : result.error);
    });
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        disabled={pending || status === "completed"}
        aria-pressed={status === "completed"}
        onClick={() => choose("completed")}
        style={{ ...smallButton, ...(status === "completed" ? { background: colors.green, color: "#fff", border: "none" } : {}) }}
      >
        Completed
      </button>
      <button
        type="button"
        disabled={pending || status === "no_show"}
        aria-pressed={status === "no_show"}
        onClick={() => choose("no_show")}
        style={{ ...smallButton, ...(status === "no_show" ? { background: "oklch(0.6 0.1 85)", color: "#fff", border: "none" } : {}) }}
      >
        Client didn&apos;t attend
      </button>
      {error && (
        <span role="alert" style={errorTextStyle}>
          {error}
        </span>
      )}
    </div>
  );
}

export function MessageClientButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await startThread({ appointmentId });
            if (result.ok) router.push(`/staff/messages?thread=${result.threadId}`);
            else setError(result.error);
          })
        }
        style={smallButton}
      >
        Message client
      </button>
      {error && (
        <span role="alert" style={errorTextStyle}>
          {error}
        </span>
      )}
    </>
  );
}

export function StaffDocuments({ appointmentId, documents }: { appointmentId: string; documents: StaffDocumentView[] }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (files: File[]) =>
    startUpload(async () => {
      setNotice(null);
      const supabase = createClient();
      for (const file of files) {
        const url = await createStaffDocumentUpload({ appointmentId, fileName: file.name, size: file.size, mimeType: file.type });
        if (!url.ok) {
          setNotice(`${file.name}: ${url.error}`);
          continue;
        }
        const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).uploadToSignedUrl(url.path, url.token, file, { contentType: file.type });
        if (error) {
          setNotice(`${file.name} couldn't be uploaded. Please try again.`);
          continue;
        }
        const saved = await confirmStaffDocumentUpload({ appointmentId, path: url.path, fileName: file.name });
        if (!saved.ok) setNotice(`${file.name}: ${saved.error}`);
      }
    });

  const download = async (documentId: string) => {
    const result = await getStaffDocumentUrl({ documentId });
    if (result.ok) window.location.assign(result.url);
    else setNotice(result.error);
  };

  return (
    <div>
      {documents.length === 0 ? (
        <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)", marginBottom: 10 }}>No documents yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {documents.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ overflowWrap: "anywhere" }}>
                {d.fileName}
                <span style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)" }}>
                  {" "}
                  · {d.addedLabel} · {d.sizeLabel}
                  {d.fromFirm ? " · Added by the firm" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => download(d.id)}
                style={{ border: "none", background: "none", color: colors.green, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={smallButton}>
        {uploading ? "Uploading…" : "+ Add document for client"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        aria-label="Add document for client"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) upload(files);
        }}
      />
      {notice && (
        <div role="alert" style={{ ...errorTextStyle, marginTop: 8 }}>
          {notice}
        </div>
      )}
    </div>
  );
}
