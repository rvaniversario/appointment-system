import type { CSSProperties } from "react";

/** Shared inline-style helpers mirroring the approved design's tokens 1:1. */

export const colors = {
  navy: "oklch(0.28 0.05 258)",
  navyDark: "oklch(0.25 0.01 258)",
  ink: "oklch(0.32 0.01 258)",
  gold: "oklch(0.72 0.1 85)",
  green: "oklch(0.5 0.08 150)",
  greenHover: "oklch(0.4 0.09 150)",
  errorText: "oklch(0.55 0.16 25)",
  errorTextStrong: "oklch(0.4 0.14 25)",
  errorTextAlt: "oklch(0.5 0.14 25)",
  errorBorderInput: "oklch(0.6 0.16 25)",
};

export const label: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "oklch(0.4 0.01 258)",
  display: "block",
  marginBottom: 6,
};

export function fieldStyle(hasError?: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    border: `1px solid ${hasError ? colors.errorBorderInput : "oklch(0.85 0.005 90)"}`,
    borderRadius: 7,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  };
}

export const settingsFieldStyle: CSSProperties = {
  padding: "12px 14px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 8,
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
};

export const portalLoginFieldStyle: CSSProperties = {
  padding: "11px 12px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

export function card(padding = "18px 20px"): CSSProperties {
  return {
    background: "#fff",
    border: "1px solid oklch(0.9 0.005 90)",
    borderRadius: 12,
    padding,
  };
}

export const primaryButton: CSSProperties = {
  padding: "14px 0",
  border: "none",
  borderRadius: 8,
  background: colors.navy,
  color: "#fff",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

export function primaryButtonDisabled(disabled: boolean): CSSProperties {
  return {
    padding: "14px 0",
    border: "none",
    borderRadius: 8,
    width: "100%",
    fontSize: 15,
    fontWeight: 600,
    marginTop: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "oklch(0.9 0.005 90)" : colors.navy,
    color: disabled ? "oklch(0.6 0.01 258)" : "#fff",
  };
}

export const secondaryButton: CSSProperties = {
  padding: "9px 14px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  background: "#fff",
  fontSize: 14,
  fontWeight: 600,
  color: colors.navy,
  cursor: "pointer",
};

export const linkButton: CSSProperties = {
  border: "none",
  background: "none",
  color: colors.green,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};

export const errorTextStyle: CSSProperties = {
  fontSize: 12.5,
  color: colors.errorText,
  marginTop: 4,
};

export const sectionTitle: CSSProperties = {
  fontFamily: "var(--font-lora), serif",
  fontWeight: 600,
  fontSize: 26,
  color: "oklch(0.25 0.01 258)",
  margin: "0 0 6px",
};

export const pageSub: CSSProperties = {
  fontSize: 15,
  color: "oklch(0.5 0.01 258)",
  margin: "0 0 24px",
};
