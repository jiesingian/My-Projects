"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  deleteDirectMessageAction,
  deleteFamilyMessageAction,
  markThreadReadAction,
  sendDirectMessageAction,
  sendFamilyMessageAction,
} from "@/lib/actions/chat-rooms";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";
import type { RoomMessage } from "@/lib/queries/chat-rooms";

/** The family-tree room, or a conversation with one person (29 September).
 * Plainer than the household chat on purpose, like the linked-household
 * thread it is modelled on: words, live, with a notification -- the house's
 * photos, polls and shopping lists stay in the house's own chat.
 *
 * Live over a private channel (chat_topic_is_mine): 'family-tree:<household>'
 * or 'dm:<low>:<high>'. Row-level security decides which changed rows arrive,
 * so the channel only says "something changed" and the page re-reads. */
export function RoomThread({
  room,
  messages,
  topic,
  placeholder,
  emptyText,
  canWrite = true,
}: {
  room: { kind: "family" } | { kind: "dm"; personId: string; low: string; high: string };
  messages: RoomMessage[];
  topic: string;
  placeholder: string;
  emptyText: string;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const readKey = room.kind === "family" ? "family" : (`dm:${room.personId}` as const);
  const table = room.kind === "family" ? "family_tree_messages" : "direct_messages";
  const filter = room.kind === "dm" ? `person_low=eq.${room.low}` : undefined;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    // Seeing it is reading it, including what arrives while it is open.
    void markThreadReadAction(readKey);
  }, [messages.length, readKey]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth().catch(() => {});
      if (cancelled) return;
      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => router.refresh())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, table, filter, router]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    startTransition(async () => {
      const r = room.kind === "family" ? await sendFamilyMessageAction(body) : await sendDirectMessageAction(room.personId, body);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      }
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const r = room.kind === "family" ? await deleteFamilyMessageAction(id) : await deleteDirectMessageAction(id);
      if (r.error) setError(r.error);
      router.refresh();
    });

  const rows = messages.map((m, i) => {
    const day = familyDateLong(new Date(m.createdAt));
    const prev = messages[i - 1];
    return { m, day, showDay: !prev || familyDateLong(new Date(prev.createdAt)) !== day };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2rem 1rem", lineHeight: 1.5 }}>{emptyText}</p>
        )}
        {rows.map(({ m, day, showDay }) => (
          <div key={m.id}>
            {showDay && <div className="kin-linkthread-day">{day}</div>}
            <div style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginTop: "0.5rem" }}>
              <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start" }}>
                {room.kind === "family" && !m.mine && (
                  <span className="kin-linkthread-who">
                    {m.authorName}
                    {m.householdName && !m.ourHousehold ? ` · ${m.householdName}` : ""}
                  </span>
                )}
                <span className="kin-bubble" data-mine={m.mine || undefined} style={{ cursor: "default", whiteSpace: "pre-wrap" }}>
                  {m.body}
                </span>
                <span className="kin-linkthread-time">
                  {familyClock(new Date(m.createdAt))}
                  {m.mine && (
                    <button type="button" className="kin-linkthread-delete" disabled={pending} onClick={() => remove(m.id)}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {error && (
        <p role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", margin: "0.375rem 0 0" }}>
          {error}
        </p>
      )}

      {canWrite ? (
        <div className="kin-glass-bar kin-composer">
          <div className="kin-composer-row">
            <textarea
              className="input kin-composer-field"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={placeholder}
              rows={1}
              maxLength={2000}
              aria-label={placeholder}
              style={{ minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "1rem", resize: "none", paddingTop: "0.5625rem" }}
            />
            <button
              type="button"
              className="btn btn-primary btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              disabled={pending || !draft.trim()}
              onClick={send}
              aria-label="Send"
            >
              <Icon name="upload" size="1rem" />
            </button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "0.75rem 0" }}>
          You&rsquo;re no longer connected, so nothing new can be sent here.
        </p>
      )}
    </div>
  );
}
