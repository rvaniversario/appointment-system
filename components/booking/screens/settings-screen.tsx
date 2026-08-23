"use client";

import type { ChangeEvent } from "react";
import type { ErrorState, PortalInvoice, SettingsState, SettingsTab } from "@/lib/booking/types";
import { initialsOf } from "@/lib/booking/data";
import { linkButton, settingsFieldStyle } from "@/lib/booking/ui";

interface SettingsScreenProps {
  settings: SettingsState;
  settingsTab: SettingsTab;
  settingsSaved: boolean;
  errors: ErrorState;
  availableTabs: { key: SettingsTab; label: string }[];
  portalInvoiceItems: PortalInvoice[];
  onBack: () => void;
  onSetTab: (tab: SettingsTab) => void;
  onFieldChange: (patch: Partial<SettingsState>) => void;
  onPhotoChange: (dataUrl: string) => void;
  onSave: () => void;
  onPayInvoice: (id: number) => void;
}

export function SettingsScreen({
  settings,
  settingsTab,
  settingsSaved,
  errors,
  availableTabs,
  portalInvoiceItems,
  onBack,
  onSetTab,
  onFieldChange,
  onPhotoChange,
  onSave,
  onPayInvoice,
}: SettingsScreenProps) {
  const fullName = [settings.firstName, settings.lastName].filter(Boolean).join(" ");

  const handlePhotoInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onPhotoChange(reader.result);
    };
    reader.readAsDataURL(file);
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
                      cursor: "pointer",
                    }}
                  >
                    Change photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoInput}
                      style={{ display: "none" }}
                    />
                  </label>
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
                    onChange={(e) => onFieldChange({ email: e.target.value })}
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
                    Mobile number
                  </label>
                  <input
                    type="tel"
                    value={settings.mobile}
                    onChange={(e) => onFieldChange({ mobile: e.target.value })}
                    style={settingsFieldStyle}
                  />
                </div>
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
                  <input
                    type="password"
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
                  <input
                    type="password"
                    value={settings.confirmPassword}
                    onChange={(e) => onFieldChange({ confirmPassword: e.target.value })}
                    style={settingsFieldStyle}
                  />
                </div>
                {errors.settingsPassword && (
                  <div style={{ fontSize: 12.5, color: "oklch(0.55 0.16 25)" }}>
                    Passwords do not match
                  </div>
                )}
                {settingsSaved && (
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
                  onClick={onSave}
                  style={{
                    padding: "13px 0",
                    border: "none",
                    borderRadius: 8,
                    background: "oklch(0.28 0.05 258)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginTop: 6,
                  }}
                >
                  Save changes
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
