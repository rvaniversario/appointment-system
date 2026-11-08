"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { markThreadRead, sendMessage } from "@/lib/portal/actions";
import type { PortalContact, PortalMessage } from "@/lib/portal/types";
import { card, colors, errorTextStyle, portalHeading } from "@/lib/booking/ui";

interface MessagesViewProps {
  contacts: PortalContact[];
  selected: PortalContact | null;
  messages: PortalMessage[];
}

export function MessagesView({ contacts, selected, messages }: MessagesViewProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  const threadId = selected?.threadId ?? null;
  const unread = selected?.unread ?? 0;
  useEffect(() => {
    if (threadId && unread > 0) void markThreadRead({ threadId });
  }, [threadId, unread]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  if (!selected) {
    return (
      <div>
        <h2 style={portalHeading}>Messages</h2>
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>
          Once you&apos;ve booked a consultation, you can message your attorney here.
        </div>
      </div>
    );
  }

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    startSending(async () => {
      const result = await sendMessage({ attorneyId: selected.attorneyId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setDraft("");
    });
  };

  return (
    <div>
      <h2 style={portalHeading}>Messages with {selected.attorneyName}</h2>

      {contacts.length > 1 && (
        <nav aria-label="Conversations" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {contacts.map((c) => {
            const active = c.attorneyId === selected.attorneyId;
            return (
              <Link
                key={c.attorneyId}
                href={`/portal/messages?with=${c.attorneyId}`}
                aria-current={active ? "page" : undefined}
                style={{
                  padding: "7px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  background: active ? colors.navy : "#fff",
                  color: active ? "#fff" : "oklch(0.4 0.01 258)",
                  border: `1px solid ${active ? colors.navy : "oklch(0.88 0.005 90)"}`,
                }}
              >
                {c.attorneyName} · {c.firmName}
                {c.unread > 0 && !active ? ` (${c.unread})` : ""}
              </Link>
            );
          })}
        </nav>
      )}

      <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginBottom: 10 }}>
        {selected.firmName} · Only you and {selected.firmName} can read these messages.
      </div>

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
        {messages.length === 0 && (
          <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>No messages yet. Write the first one below.</div>
        )}
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
    </div>
  );
}
