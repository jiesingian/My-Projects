"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { familyDay, familyClock, familyDateLong } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import {
  sendMessageAction,
  deleteMessageAction,
  editMessageAction,
  reactToMessageAction,
  markChatReadAction,
} from "@/lib/actions/chat";
import type { ChatMember, ChatMessage } from "@/lib/queries/chat";
import { REACTIONS } from "@/lib/chat";

// Rendered from the same list the action checks against, so a reaction the
// composer offers can never be one the server refuses.

/* Both of these read a stored instant, so both are answered in the household's
   own zone rather than the viewer's. A thread is a shared record of one house:
   a message sent at dinner should say dinner to everyone reading it, including
   whoever is abroad this week. It also keeps the server's render and the
   browser's first render identical, which is what stops React discarding the
   thread and rebuilding it on load. */
function dayLabel(iso: string) {
  const day = familyDay(new Date(iso));
  if (day === familyDay()) return "Today";
  if (day === familyDay(new Date(Date.now() - 24 * 60 * 60 * 1000))) return "Yesterday";
  return familyDateLong(new Date(iso));
}

function clockOf(iso: string) {
  return familyClock(new Date(iso));
}

/** The household's thread. Messages arrive as they are sent — the page holds
 * a live subscription rather than waiting for a refresh — and anyone can be
 * tagged by name, which is what makes a message reach the right person in a
 * room where everyone is listening. */
export function ChatThread({
  me,
  members,
  initial,
}: {
  me: string;
  members: (ChatMember & { label: string })[];
  initial: ChatMessage[];
}) {
  const router = useRouter();
  // The thread itself is the server's; this component keeps only what the
  // server does not know yet — a message on its way out.
  const messages = initial;
  const [draft, setDraft] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pendingBody]);

  // Read on arrival, and again whenever something new lands while looking.
  // The first one also refreshes, so the count on the tab clears with it.
  const cleared = useRef(false);
  useEffect(() => {
    void markChatReadAction().then(() => {
      if (cleared.current) return;
      cleared.current = true;
      router.refresh();
    });
  }, [messages.length, router]);

  // Live: any change to the thread pulls the page's own data again, so what
  // is on screen is what is in the database rather than a guess at it.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("family-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "family_messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "family_message_reactions" }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  /** What is being typed after an "@", if the cursor is still inside it. */
  const mentionQuery = (() => {
    const at = draft.lastIndexOf("@");
    if (at === -1) return null;
    const after = draft.slice(at + 1);
    if (/\s{2,}|\n/.test(after)) return null;
    return after.length <= 20 ? after.toLowerCase() : null;
  })();

  const suggestions = mentionQuery === null ? [] : members.filter((m) => m.id !== me && m.label.toLowerCase().startsWith(mentionQuery));

  const pickMention = (m: (typeof members)[number]) => {
    const at = draft.lastIndexOf("@");
    setDraft(`${draft.slice(0, at)}@${m.label} `);
    setMentioned((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
    input.current?.focus();
  };

  const send = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    // Only tags still standing in the text count.
    const stillThere = mentioned.filter((id) => body.includes(`@${byId.get(id)?.label ?? ""}`));
    setDraft("");
    setMentioned([]);
    setPendingBody(body);
    setError(null);
    startTransition(async () => {
      const result = await sendMessageAction({ body, mentions: stillThere });
      if (result.error) {
        setError(result.error);
        setPendingBody(null);
        setDraft(body);
        return;
      }
      // Both inside the transition, so the optimistic bubble is only taken
      // away in the same commit that brings the real one in.
      router.refresh();
      setPendingBody(null);
    });
  }, [draft, mentioned, byId, router]);

  const act = (fn: () => Promise<{ error: string | null }>) => {
    setOpenFor(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  // Day breaks and speaker runs are worked out up front: a conversation is
  // read as turns, and the previous message is what decides where one ends.
  const rows = messages.map((m, i) => {
    const prev = messages[i - 1];
    const day = dayLabel(m.createdAt);
    const showDay = !prev || dayLabel(prev.createdAt) !== day;
    return { m, day, showDay, runStart: showDay || prev?.memberId !== m.memberId };
  });

  return (
    /* Tall enough that the composer sits just above the tab bar even when
       only one thing has been said. */
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }}>
        {messages.length === 0 && !pendingBody && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2.5rem 1.25rem", lineHeight: 1.5 }}>
            Nothing said yet. This is the whole household&rsquo;s thread — type <strong>@</strong> to tag someone in particular.
          </p>
        )}

        {rows.map(({ m, day, showDay, runStart }) => {
          const mine = m.memberId === me;
          const author = m.memberId ? byId.get(m.memberId) : undefined;
          const tagsMe = m.mentions.includes(me);

          return (
            <div key={m.id}>
              {showDay && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", margin: "16px 0 10px" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                  <span style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>{day}</span>
                  <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: mine ? "flex-end" : "flex-start", marginTop: runStart ? 8 : 2 }}>
                {!mine && (
                  <span style={{ width: 28, flex: "none" }}>
                    {runStart && <Avatar url={author?.photoUrl ?? null} initials={author?.initials ?? "?"} label={author?.label ?? "Someone"} size={28} />}
                  </span>
                )}

                <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                  {runStart && !mine && (
                    <span style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0 0 2px 10px" }}>
                      {author?.label ?? "Someone"}
                    </span>
                  )}

                  {editing?.id === m.id ? (
                    <div style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end" }}>
                      <textarea
                        className="input"
                        value={editing.body}
                        onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                        rows={2}
                        style={{ minHeight: "2.75rem", fontSize: "0.9375rem", width: "13.75rem", resize: "none" }}
                        aria-label="Edit this message"
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.625rem" }}
                        onClick={() => {
                          const body = editing.body;
                          setEditing(null);
                          act(() => editMessageAction(m.id, body));
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ minHeight: "2.125rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                      className="kin-bubble"
                      data-mine={mine}
                      data-tagged={tagsMe && !mine}
                      aria-label={`Message from ${mine ? "you" : (author?.label ?? "someone")} at ${clockOf(m.createdAt)}`}
                    >
                      {m.deleted ? (
                        <span style={{ opacity: 0.65, fontStyle: "italic" }}>Message withdrawn</span>
                      ) : (
                        <MessageBody body={m.body} members={members} me={me} mine={mine} />
                      )}
                    </button>
                  )}

                  {m.reactions.length > 0 && (
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: -6, marginLeft: mine ? 0 : 8, marginRight: mine ? 8 : 0, zIndex: 1 }}>
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => act(() => reactToMessageAction(m.id, r.memberIds.includes(me) ? null : r.emoji))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.1875rem",
                            fontSize: "0.71875rem",
                            padding: "0.0625rem 0.375rem",
                            borderRadius: 999,
                            border: "1px solid var(--color-divider)",
                            background: "var(--color-surface)",
                            cursor: "pointer",
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {r.emoji}
                          {r.memberIds.length > 1 && <span style={{ color: "var(--color-neutral-600)" }}>{r.memberIds.length}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {openFor === m.id && !m.deleted && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.125rem",
                        marginTop: "0.3125rem",
                        padding: "0.25rem",
                        borderRadius: 999,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-divider)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      {REACTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => act(() => reactToMessageAction(m.id, e))}
                          aria-label={`React ${e}`}
                          style={{ border: 0, background: "none", cursor: "pointer", fontSize: "1.0625rem", padding: "0.125rem 0.25rem", lineHeight: 1 }}
                        >
                          {e}
                        </button>
                      ))}
                      {mine && (
                        <>
                          <span style={{ width: 1, height: 18, background: "var(--color-divider)", margin: "0 3px" }} />
                          <button
                            type="button"
                            onClick={() => {
                              setEditing({ id: m.id, body: m.body });
                              setOpenFor(null);
                            }}
                            className="btn btn-ghost"
                            style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => act(() => deleteMessageAction(m.id))}
                            className="btn btn-ghost"
                            style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem", color: "var(--cal-occasion)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <span style={{ fontSize: "0.65625rem", color: "var(--color-neutral-600)", margin: "3px 4px 0" }}>
                    {clockOf(m.createdAt)}
                    {m.editedAt && !m.deleted ? " · edited" : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Your own message, on screen before the server has it. */}
        {pendingBody && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <div style={{ maxWidth: "76%", opacity: 0.6 }}>
              <span className="kin-bubble" data-mine="true">
                {pendingBody}
              </span>
            </div>
          </div>
        )}

        <div ref={bottom} />
      </div>

      {error && (
        <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", padding: "0.375rem 0.125rem" }} role="alert">
          {error}
        </div>
      )}

      {/* The composer stays in reach at the bottom, above the tab bar. Its
          placement lives in globals.css rather than here: it has to change
          shape at 1024px, where the tab bar becomes a sidebar and there is
          nothing left below the composer to clear, and an inline style
          cannot answer a media query. The class is also what tells
          .kin-content this page ends in a composer. */}
      <div className="kin-glass-bar kin-composer">
        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", paddingBottom: "0.5rem" }}>
            {suggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMention(m)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.25rem 0.625rem 0.25rem 0.25rem",
                  borderRadius: 999,
                  border: "1px solid var(--color-divider)",
                  background: "var(--color-surface)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.84375rem",
                }}
              >
                <Avatar url={m.photoUrl} initials={m.initials} label={m.label} size={22} />
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end", paddingBottom: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            style={{ width: 38, height: 38, flex: "none" }}
            aria-label="Tag someone"
            onClick={() => {
              setDraft((d) => `${d}${d.endsWith(" ") || d === "" ? "" : " "}@`);
              input.current?.focus();
            }}
          >
            <span style={{ font: "600 1.0625rem/1 var(--font-heading)" }}>@</span>
          </button>
          <textarea
            ref={input}
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line, as everywhere else.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message the family…"
            rows={1}
            aria-label="Your message"
            style={{ flex: 1, minWidth: 0, minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "0.9375rem", resize: "none", paddingTop: "0.5625rem" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ width: 38, height: 38, flex: "none" }}
            disabled={!draft.trim()}
            onClick={send}
            aria-label="Send"
          >
            <Icon name="upload" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The message, with anyone tagged in it picked out. Matching is by the
 * label the composer inserted, so a tag reads as a tag rather than as an
 * email address someone happened to type. */
function MessageBody({
  body,
  members,
  me,
  mine,
}: {
  body: string;
  members: (ChatMember & { label: string })[];
  me: string;
  mine: boolean;
}) {
  const labels = members.map((m) => ({ ...m, token: `@${m.label}` })).sort((a, b) => b.token.length - a.token.length);

  const parts: React.ReactNode[] = [];
  let rest = body;
  let key = 0;

  while (rest.length > 0) {
    const at = rest.indexOf("@");
    if (at === -1) {
      parts.push(rest);
      break;
    }
    const hit = labels.find((l) => rest.startsWith(l.token, at));
    if (!hit) {
      parts.push(rest.slice(0, at + 1));
      rest = rest.slice(at + 1);
      continue;
    }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(
      <strong
        key={key++}
        style={{
          fontWeight: 600,
          color: mine ? "#fff" : hit.id === me ? "var(--color-accent-700)" : "var(--color-accent)",
        }}
      >
        {hit.token}
      </strong>,
    );
    rest = rest.slice(at + hit.token.length);
  }

  return <>{parts}</>;
}
