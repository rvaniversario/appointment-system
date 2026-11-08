"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ConversationPanel, type ConversationMessage } from "@/components/messages/conversation-panel";
import { markStaffThreadRead, sendStaffMessage } from "@/lib/staff/actions";
import type { StaffThread } from "@/lib/staff/types";
import { card, colors, pageHeading } from "@/lib/booking/ui";

export function StaffMessages({
  threads,
  selected,
  messages,
}: {
  threads: StaffThread[];
  selected: StaffThread | null;
  messages: ConversationMessage[];
}) {
  const threadId = selected?.threadId ?? null;
  const unread = selected?.unread ?? 0;
  useEffect(() => {
    if (threadId && unread > 0) void markStaffThreadRead({ threadId });
  }, [threadId, unread]);

  return (
    <div>
      <h2 style={pageHeading}>Messages</h2>
      {threads.length === 0 ? (
        <div style={{ ...card(), fontSize: 14, color: "oklch(0.5 0.01 258)" }}>
          No conversations yet. Clients can message you from their portal, or start one from an appointment.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
          <nav aria-label="Conversations" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {threads.map((t) => {
              const active = t.threadId === threadId;
              return (
                <Link
                  key={t.threadId}
                  href={`/staff/messages?thread=${t.threadId}`}
                  aria-current={active ? "page" : undefined}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    textDecoration: "none",
                    background: active ? "oklch(0.94 0.02 258)" : "transparent",
                    color: colors.ink,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>{t.clientName}</span>
                    {t.unread > 0 && !active && <span style={{ color: colors.errorText }}>{t.unread}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "oklch(0.55 0.01 258)" }}>
                    with {t.attorneyName}
                    {t.lastLabel ? ` · ${t.lastLabel}` : ""}
                  </div>
                </Link>
              );
            })}
          </nav>
          <div style={{ minWidth: 0 }}>
            {selected ? (
              <>
                <div style={{ fontSize: 13, color: "oklch(0.55 0.01 258)", marginBottom: 10 }}>
                  {selected.clientName} and {selected.attorneyName}. Partners and admins of the firm can also read this.
                </div>
                <ConversationPanel
                  messages={messages}
                  onSend={(body) => sendStaffMessage({ threadId: selected.threadId, body })}
                  emptyText="No messages yet."
                />
              </>
            ) : (
              <div style={{ fontSize: 14, color: "oklch(0.55 0.01 258)" }}>Choose a conversation.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
