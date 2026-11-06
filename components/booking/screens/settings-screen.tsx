"use client";

import type { ChangeEvent } from "react";
import { PasswordInput } from "@/components/booking/password-input";
import type { AccountSettings } from "@/components/account/use-account-settings";
import type { PortalInvoice, SettingsTab } from "@/lib/booking/types";
import { initialsOf } from "@/lib/booking/data";
import { linkButton, settingsFieldStyle } from "@/lib/booking/ui";

const errorTextStyle = { fontSize: 12.5, color: "oklch(0.55 0.16 25)" };

interface SettingsScreenProps {
  account: AccountSettings;
  /** Off for clients, who sign in with an emailed code and have no password. */
  showPasswordFields: boolean;
  settingsTab: SettingsTab;
  availableTabs: { key: SettingsTab; label: string }[];
  portalInvoiceItems: PortalInvoice[];
  onBack: () => void;
  onSetTab: (tab: SettingsTab) => void;
  onPayInvoice: (id: number) => void;
}

export function SettingsScreen({
  account,
  showPasswordFields,
  settingsTab,
  availableTabs,
  portalInvoiceItems,
  onBack,
  onSetTab,
  onPayInvoice,
}: SettingsScreenProps) {
  const { settings, saving, saved, saveError, passwordError, photoUploading, photoError, onFieldChange } = account;
  const fullName = [settings.firstName, settings.lastName].filter(Boolean).join(" ");

  const handlePhotoInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Cleared so choosing the same file again still fires a change event.
    e.target.value = "";
    if (file) account.onPhotoChange(file);
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
      <button onClick={onBack} style={{ ...linkButton, marginBottom: 18 }}>
        ← Back
      </button>
      <h1
        style={{
          fontFamily: "var(--font-lora), serif",
          fontSize: 24,
          fontWeight: 600,
          color: "oklch(0.25 0.01 258)",
          margin: "0 0 24px",
        }}
      >
        Account settings
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 32 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {availableTabs.map((tab) => {
            const active = settingsTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onSetTab(tab.key)}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: active ? "oklch(0.94 0.02 258)" : "none",
                  color: active ? "oklch(0.28 0.05 258)" : "oklch(0.5 0.01 258)",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          {settingsTab === "profile" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "oklch(0.28 0.05 258)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 700,
                    overflow: "hidden",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundImage: settings.photo ? `url(${settings.photo})` : undefined,
                  }}
                >
                  {!settings.photo && initialsOf(fullName || "Account")}
                </div>
                <div>
                  <label
                    style={{
                      display: "inline-block",
                      padding: "9px 14px",
                      border: "1px solid oklch(0.85 0.005 90)",
                      borderRadius: 7,
                      background: "#fff",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "oklch(0.32 0.01 258)",
                      cursor: photoUploading ? "wait" : "pointer",
                      opacity: photoUploading ? 0.7 : 1,
                    }}
                  >
                    {photoUploading ? "Uploading…" : "Change photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={photoUploading}
                      onChange={handlePhotoInput}
                      style={{ display: "none" }}
                    />
                  </label>
                  {photoError && (
                    <div role="alert" style={{ ...errorTextStyle, marginTop: 6 }}>
                      {photoError}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "oklch(0.4 0.01 258)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      First name
                    </label>
                    <input
                      type="text"
                      value={settings.firstName}
                      onChange={(e) => onFieldChange({ firstName: e.target.value })}
                      style={settingsFieldStyle}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "oklch(0.4 0.01 258)",
                        display: "block",
                        marginBottom: 6,
                      }}
                    >
                      Middle name
                    </label>
                    <input
                      type="text"
                      value={settings.middleName}
                      onChange={(e) => onFieldChange({ middleName: e.target.value })}
                      style={settingsFieldStyle}
                    />
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.4 0.01 258)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Last name
                  </label>
                  <input
                    type="text"
                    value={settings.lastName}
                    onChange={(e) => onFieldChange({ lastName: e.target.value })}
                    style={settingsFieldStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.4 0.01 258)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Date of birth
                  </label>
                  <input
                    type="date"
                    value={settings.dob}
                    onChange={(e) => onFieldChange({ dob: e.target.value })}
                    style={settingsFieldStyle}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.4 0.01 258)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={settings.email}
                    readOnly
                    aria-describedby="settings-email-note"
                    style={{ ...settingsFieldStyle, background: "oklch(0.96 0.003 90)", color: "oklch(0.5 0.01 258)" }}
                  />
                  <div id="settings-email-note" style={{ fontSize: 12.5, color: "oklch(0.5 0.01 258)", marginTop: 6 }}>
                    Your email can&apos;t be changed here yet.
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "oklch(0.4 0.01 258)",
                      display: "block",
                      marginBottom: 6,
                    }}
                  >
                    Mobile number
                  </label>
                  <input
                    type="tel"
                    value={settings.mobile}
                    onChange={(e) => onFieldChange({ mobile: e.target.value })}
                    placeholder="0917 123 4567"
                    style={settingsFieldStyle}
                  />
                </div>
                {showPasswordFields && (
                  <>
                    <div style={{ height: 1, background: "oklch(0.92 0.005 90)", margin: "6px 0" }} />
                    <div>
                      <label
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "oklch(0.4 0.01 258)",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        New password
                      </label>
                      <PasswordInput
                        autoComplete="new-password"
                        value={settings.password}
                        onChange={(e) => onFieldChange({ password: e.target.value })}
                        placeholder="Leave blank to keep current password"
                        style={settingsFieldStyle}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "oklch(0.4 0.01 258)",
                          display: "block",
                          marginBottom: 6,
                        }}
                      >
                        Confirm new password
                      </label>
                      <PasswordInput
                        autoComplete="new-password"
                        value={settings.confirmPassword}
                        onChange={(e) => onFieldChange({ confirmPassword: e.target.value })}
                        style={settingsFieldStyle}
                      />
                    </div>
                    {passwordError && (
                      <div role="alert" style={errorTextStyle}>
                        {passwordError}
                      </div>
                    )}
                  </>
                )}
                {saveError && (
                  <div role="alert" style={errorTextStyle}>
                    {saveError}
                  </div>
                )}
                {saved && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "oklch(0.4 0.09 150)",
                      background: "oklch(0.96 0.03 150)",
                      borderRadius: 7,
                      padding: "10px 14px",
                    }}
                  >
                    Your changes have been saved.
                  </div>
                )}
                <button
                  onClick={account.save}
                  disabled={saving}
                  style={{
                    padding: "13px 0",
                    border: "none",
                    borderRadius: 8,
                    background: "oklch(0.28 0.05 258)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                    opacity: saving ? 0.7 : 1,
                    marginTop: 6,
                  }}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          )}

          {settingsTab === "billing" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {portalInvoiceItems.map((inv) => {
                const isDue = inv.status === "due";
                return (
                  <div
                    key={inv.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "#fff",
                      border: "1px solid oklch(0.9 0.005 90)",
                      borderRadius: 10,
                      padding: "14px 18px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
                        {inv.desc}
                      </div>
                      <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginTop: 2 }}>
                        {inv.date}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.28 0.05 258)" }}>
                        {inv.amount}
                      </span>
                      {isDue && (
                        <button
                          onClick={() => onPayInvoice(inv.id)}
                          style={{
                            padding: "8px 14px",
                            border: "none",
                            borderRadius: 7,
                            background: "oklch(0.28 0.05 258)",
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Pay now
                        </button>
                      )}
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: 20,
                          background: isDue ? "oklch(0.95 0.03 25)" : "oklch(0.95 0.02 150)",
                          color: isDue ? "oklch(0.5 0.14 25)" : "oklch(0.4 0.07 150)",
                        }}
                      >
                        {isDue ? "Due" : "Paid"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
