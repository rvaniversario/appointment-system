"use client";

import type { CSSProperties } from "react";

export interface StepperItem {
  label: string;
  state: "done" | "current" | "todo";
  onClick?: () => void;
}

export interface UserMenuData {
  name: string;
  initials: string;
  email: string;
  isClient: boolean;
  photo: string | null;
  onLogout: () => void;
  onSettings: () => void;
  onAppointments?: () => void;
  onMessages?: () => void;
  onDocuments?: () => void;
}

interface HeaderProps {
  onGoHome: () => void;
  stepper: StepperItem[] | null;
  userMenu: UserMenuData | null;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  showBackLink: boolean;
  onOpenPortal: () => void;
}

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  border: "none",
  background: "none",
  borderRadius: 6,
  fontSize: 14,
  color: "oklch(0.32 0.01 258)",
  cursor: "pointer",
};

export function Header({
  onGoHome,
  stepper,
  userMenu,
  userMenuOpen,
  onToggleUserMenu,
  showBackLink,
  onOpenPortal,
}: HeaderProps) {
  return (
    <header
      style={{
        background: "#fff",
        borderBottom: "1px solid oklch(0.9 0.005 90)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
          onClick={onGoHome}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: "oklch(0.28 0.05 258)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid oklch(0.72 0.1 85)",
                borderRadius: "50%",
              }}
            />
          </div>
          <div>
            <div
              style={{
                fontFamily: "var(--font-lora), serif",
                fontWeight: 600,
                fontSize: 19,
                color: "oklch(0.28 0.05 258)",
                lineHeight: 1.1,
              }}
            >
              Harlow &amp; Reyes
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.04em",
                color: "oklch(0.55 0.01 258)",
                textTransform: "uppercase",
              }}
            >
              Attorneys at Law
            </div>
          </div>
        </div>

        {stepper && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {stepper.map((step, idx) => (
              <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
                <div
                  onClick={step.onClick}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    cursor: step.state === "done" ? "pointer" : "default",
                    width: 64,
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background:
                        step.state === "current"
                          ? "oklch(0.72 0.1 85)"
                          : step.state === "done"
                          ? "oklch(0.28 0.05 258)"
                          : "oklch(0.92 0.005 90)",
                      color: step.state === "todo" ? "oklch(0.55 0.01 258)" : "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {step.state === "done" ? "✓" : idx + 1}
                  </div>
                  <div style={{ fontSize: 10.5, color: "oklch(0.5 0.01 258)", textAlign: "center" }}>
                    {step.label}
                  </div>
                </div>
                {idx < stepper.length - 1 && (
                  <div
                    style={{
                      width: 20,
                      height: 1,
                      background: "oklch(0.85 0.005 90)",
                      margin: "0 2px",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {userMenu && (
          <div style={{ position: "relative" }}>
            <div
              onClick={onToggleUserMenu}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "oklch(0.28 0.05 258)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                overflow: "hidden",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundImage: userMenu.photo ? `url(${userMenu.photo})` : undefined,
              }}
            >
              {!userMenu.photo && userMenu.initials}
            </div>
            {userMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 44,
                  background: "#fff",
                  border: "1px solid oklch(0.9 0.005 90)",
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                  padding: 8,
                  minWidth: 210,
                  zIndex: 20,
                }}
              >
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "oklch(0.25 0.01 258)" }}>
                    {userMenu.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)", marginTop: 1 }}>
                    {userMenu.email}
                  </div>
                </div>
                <div style={{ height: 1, background: "oklch(0.92 0.005 90)", margin: "6px 0" }} />
                {userMenu.isClient && (
                  <>
                    <button onClick={userMenu.onAppointments} style={menuItemStyle}>
                      Appointments
                    </button>
                    <button onClick={userMenu.onMessages} style={menuItemStyle}>
                      Messages
                    </button>
                    <button onClick={userMenu.onDocuments} style={menuItemStyle}>
                      Documents
                    </button>
                    <div style={{ height: 1, background: "oklch(0.92 0.005 90)", margin: "6px 0" }} />
                  </>
                )}
                <button onClick={userMenu.onSettings} style={menuItemStyle}>
                  Account settings
                </button>
                <button
                  onClick={userMenu.onLogout}
                  style={{ ...menuItemStyle, color: "oklch(0.55 0.16 25)" }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        )}

        {showBackLink && (
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <button
              onClick={onOpenPortal}
              style={{
                border: "none",
                background: "none",
                color: "oklch(0.5 0.08 150)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Client Portal
            </button>
            <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>
              Questions? <a href="tel:5550102938">(555) 010-2938</a>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
