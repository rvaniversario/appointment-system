"use client";

import { startTransition, useState, useTransition } from "react";
import type { ActionResult } from "@/app/portal/actions";
import type { SettingsState } from "@/lib/booking/types";
import { setProfilePhoto, updateProfile } from "@/lib/profile/actions";
import type { AccountProfile } from "@/lib/profile/types";
import { createClient } from "@/lib/supabase/client";

// Matches the limits on the "avatars" storage bucket.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PROFILE_FIELDS = ["firstName", "middleName", "lastName", "dob", "mobile", "smsOptIn"] as const;

function fromAccount(account: AccountProfile | null): SettingsState {
  return {
    photo: account?.photoUrl ?? null,
    firstName: account?.firstName ?? "",
    middleName: account?.middleName ?? "",
    lastName: account?.lastName ?? "",
    dob: account?.dateOfBirth ?? "",
    email: account?.email ?? "",
    mobile: account?.mobile ?? "",
    smsOptIn: account?.smsOptIn ?? false,
    password: "",
    confirmPassword: "",
  };
}

export interface AccountSettings {
  settings: SettingsState;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
  passwordError: string | null;
  photoUploading: boolean;
  photoError: string | null;
  onFieldChange: (patch: Partial<SettingsState>) => void;
  onPhotoChange: (file: File) => void;
  save: () => void;
}

/**
 * The account settings form. The server-loaded account is the source of truth and local
 * state only holds unsaved edits, so the form always shows what's in the database.
 * updatePassword is omitted for accounts that don't sign in with a password.
 */
export function useAccountSettings(
  account: AccountProfile | null,
  updatePassword?: (password: string) => Promise<ActionResult>
): AccountSettings {
  const [edits, setEdits] = useState<Partial<SettingsState>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [photoUploading, startPhotoUpload] = useTransition();

  const stored = fromAccount(account);
  const settings: SettingsState = { ...stored, ...edits };

  const onFieldChange = (patch: Partial<SettingsState>) => {
    setSaved(false);
    setEdits((e) => ({ ...e, ...patch }));
  };

  const save = () => {
    setSaved(false);
    setSaveError(null);
    setPasswordError(null);

    const changePassword = Boolean(updatePassword && settings.password);
    if (changePassword && settings.password !== settings.confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    startSaving(async () => {
      if (PROFILE_FIELDS.some((field) => settings[field] !== stored[field])) {
        const result = await updateProfile({
          firstName: settings.firstName,
          middleName: settings.middleName,
          lastName: settings.lastName,
          dateOfBirth: settings.dob,
          mobile: settings.mobile,
          smsOptIn: settings.smsOptIn,
        });
        if (!result.ok) {
          setSaveError(result.error);
          return;
        }
        // The action also refreshed the account, so the form now reads the saved values.
        startTransition(() =>
          setEdits(({ password, confirmPassword }) => ({ password, confirmPassword }))
        );
      }

      if (changePassword && updatePassword) {
        const result = await updatePassword(settings.password);
        if (!result.ok) {
          setPasswordError(result.error);
          return;
        }
      }

      startTransition(() => setEdits({}));
      setSaved(true);
    });
  };

  const onPhotoChange = (file: File) => {
    setPhotoError(null);
    const extension = PHOTO_EXTENSIONS[file.type];
    if (!extension) {
      setPhotoError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Choose an image of 2 MB or less.");
      return;
    }
    if (!account) return;

    startPhotoUpload(async () => {
      const bucket = createClient().storage.from("avatars");
      const path = `${account.id}/${crypto.randomUUID()}.${extension}`;

      const { error } = await bucket.upload(path, file, { contentType: file.type });
      if (error) {
        console.error("[profile] photo upload failed", { message: error.message });
        setPhotoError("We couldn't upload your photo. Please try again.");
        return;
      }

      const result = await setProfilePhoto(path);
      if (!result.ok) {
        await bucket.remove([path]);
        setPhotoError(result.error);
      }
    });
  };

  return {
    settings,
    saving,
    saved,
    saveError,
    passwordError,
    photoUploading,
    photoError,
    onFieldChange,
    onPhotoChange,
    save,
  };
}
