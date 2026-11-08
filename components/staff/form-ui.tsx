"use client";

import { cloneElement, isValidElement, useId, useState, useTransition, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { card, colors, errorTextStyle, label as labelStyle, secondaryButton } from "@/lib/booking/ui";

/** Small shared pieces for the firm settings forms. */

export const field: CSSProperties = {
  padding: "9px 12px",
  border: "1px solid oklch(0.85 0.005 90)",
  borderRadius: 7,
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff",
};

export const saveButton: CSSProperties = { ...secondaryButton, background: colors.navy, color: "#fff", border: "none" };
export const smallButton: CSSProperties = { ...secondaryButton, fontSize: 13, padding: "7px 12px" };
export const quietButton: CSSProperties = {
  border: "none",
  background: "none",
  color: colors.green,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};

/**
 * A field with its label and an optional hint. The label points at the control by id and the
 * hint is its description, so screen readers announce just the label as the field's name.
 */
export function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ id?: string; "aria-describedby"?: string }> }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {isValidElement(children) ? cloneElement(children, { id, "aria-describedby": hint ? hintId : undefined }) : children}
      {hint && (
        <span id={hintId} style={{ display: "block", fontSize: 12, color: "oklch(0.55 0.01 258)", marginTop: 4 }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section style={{ ...card(), marginBottom: 18 }}>
      {title && <h3 style={{ fontSize: 15, fontWeight: 700, color: colors.navyDark, margin: "0 0 14px" }}>{title}</h3>}
      {children}
    </section>
  );
}

type Result = { ok: true } | { ok: false; error: string };

/** Runs a save action and remembers the outcome to show next to the button. */
export function useSave() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<Result>, success = "Saved.", after?: () => void) =>
    start(async () => {
      const result = await action();
      setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error });
      if (result.ok) after?.();
    });
  return { message, pending, run, clear: () => setMessage(null) };
}

export function SaveMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <span role={message.ok ? "status" : "alert"} style={message.ok ? { fontSize: 13, color: colors.green } : errorTextStyle}>
      {message.text}
    </span>
  );
}

/** "Family Law, Immigration" → ["Family Law", "Immigration"] */
export const splitList = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
