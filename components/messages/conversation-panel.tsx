"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { card, colors, errorTextStyle } from "@/lib/booking/ui";

export interface ConversationMessage {
  id: string;
  /** Sent by the side viewing the conversation. */
  mine: boolean;
  body: string;
  sentLabel: string;
}

/** A message list and reply box, shared by the client portal and the staff inbox. */
export function ConversationPanel({
  messages,
  onSend,
  emptyText = "No messages yet. Write the first one below.",
}: {
  messages: ConversationMessage[];
  onSend: (body: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  emptyText?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView returns a Promise in current browsers, and an effect
  // must not return anything but a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    startSending(async () => {
      const result = await onSend(body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setDraft("");
    });
  };

  return (
    <>
      <div
        style={{
          ...card("20px"),
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 16,
          minHeight: 200,
          maxHeight: 480,
          overflowY: "auto",
        }}
      >
        {messages.length === 0 && <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>{emptyText}</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start" }}>
            <div
              style={{
                maxWidth: "70%",
                padding: "10px 14px",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                background: m.mine ? colors.navy : "oklch(0.95 0.005 90)",
                color: m.mine ? "#fff" : colors.ink,
              }}
            >
              {m.body}
            </div>
            <div style={{ fontSize: 11.5, color: "oklch(0.6 0.01 258)", marginTop: 3 }}>{m.sentLabel}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <div role="alert" style={{ ...errorTextStyle, marginBottom: 10 }}>
          {error}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: "flex", gap: 10 }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Message"
          placeholder="Type a message…"
          maxLength={5000}
          rows={2}
          style={{
            flex: 1,
            padding: "11px 14px",
            border: "1px solid oklch(0.85 0.005 90)",
            borderRadius: 7,
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          style={{
            padding: "11px 18px",
            border: "none",
            borderRadius: 7,
            background: colors.navy,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: sending ? "wait" : "pointer",
            opacity: sending || !draft.trim() ? 0.6 : 1,
            alignSelf: "flex-end",
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </>
  );
}
