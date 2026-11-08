"use client";

import { useRef, useState, useTransition } from "react";
import { createAttorneyPhotoUpload, createLogoUpload, setAttorneyPhoto, setFirmLogo } from "@/lib/firm/actions";
import { createClient } from "@/lib/supabase/client";
import { errorTextStyle } from "@/lib/booking/ui";
import { quietButton, smallButton } from "./form-ui";

/** Uploads a firm logo or an attorney photo straight to storage through a one-time URL. */
export function ImageUploader({
  kind,
  attorneyId,
  imageUrl,
  alt,
}: {
  kind: "logo" | "attorney-photo";
  attorneyId?: string;
  imageUrl: string | null;
  alt: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const bucket = kind === "logo" ? "firm-logos" : "attorney-photos";

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      const url =
        kind === "logo"
          ? await createLogoUpload({ size: file.size, mimeType: file.type })
          : await createAttorneyPhotoUpload({ attorneyId: attorneyId ?? "", size: file.size, mimeType: file.type });
      if (!url.ok) {
        setError(url.error);
        return;
      }
      const { error: uploadError } = await createClient().storage.from(bucket).uploadToSignedUrl(url.path, url.token, file, { contentType: file.type });
      if (uploadError) {
        setError("The image couldn't be uploaded. Please try again.");
        return;
      }
      const saved = kind === "logo" ? await setFirmLogo({ path: url.path }) : await setAttorneyPhoto({ attorneyId: attorneyId ?? "", path: url.path });
      if (!saved.ok) setError(saved.error);
    });

  const remove = () =>
    start(async () => {
      const result = kind === "logo" ? await setFirmLogo({ path: null }) : await setAttorneyPhoto({ attorneyId: attorneyId ?? "", path: null });
      if (!result.ok) setError(result.error);
    });

  const size = kind === "logo" ? { width: 120, height: 60 } : { width: 96, height: 96 };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div
        style={{
          ...size,
          borderRadius: kind === "logo" ? 8 : "50%",
          border: "1px solid oklch(0.9 0.005 90)",
          background: imageUrl ? `center / ${kind === "logo" ? "contain" : "cover"} no-repeat url(${imageUrl})` : "oklch(0.96 0.005 90)",
          flexShrink: 0,
        }}
        role="img"
        aria-label={imageUrl ? alt : `No ${kind === "logo" ? "logo" : "photo"} yet`}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={pending} style={smallButton}>
            {pending ? "Saving…" : imageUrl ? "Replace" : "Upload"}
          </button>
          {imageUrl && (
            <button type="button" onClick={remove} disabled={pending} style={{ ...quietButton, color: "oklch(0.55 0.01 258)" }}>
              Remove
            </button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "oklch(0.55 0.01 258)" }}>
          JPEG, PNG or WebP, up to {kind === "logo" ? "1" : "2"} MB. Shown publicly on your booking pages.
        </span>
        {error && (
          <span role="alert" style={errorTextStyle}>
            {error}
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={kind === "logo" ? "Upload logo" : "Upload photo"}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
    </div>
  );
}
