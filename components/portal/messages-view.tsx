"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ConversationPanel } from "@/components/messages/conversation-panel";
import { markThreadRead, sendMessage } from "@/lib/portal/actions";
import type { PortalContact, PortalMessage } from "@/lib/portal/types";
import { card, colors, pageHeading } from "@/lib/booking/ui";

interface MessagesViewProps {
  contacts: PortalContact[];
  selected: PortalContact | null;
  messages: PortalMessage[];
}

export function MessagesView({ contacts, selected, messages }: MessagesViewProps) {
  const threadId = selected?.threadId ?? null;
  const unread = selected?.unread ?? 0;
  useEffect(() => {
    if (threadId && unread > 0) void markThreadRead({ threadId });
  }, [threadId, unread]);

  if (!selected) {
    return (
      <div>
        <h2 style={pageHeading}>Messages</h2>
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>
          Once you&apos;ve booked a consultation, you can message your attorney here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={pageHeading}>Messages with {selected.attorneyName}</h2>

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

      <ConversationPanel messages={messages} onSend={(body) => sendMessage({ attorneyId: selected.attorneyId, body })} />
    </div>
  );
}
