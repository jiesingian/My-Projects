"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { familyDay, familyClock, familyDateLong } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { uploadFileDirect } from "@/lib/upload-client";
import {
  sendMessageAction,
  deleteMessageAction,
  editMessageAction,
  reactToMessageAction,
  markChatReadAction,
  pinMessageAction,
  unpinMessageAction,
} from "@/lib/actions/chat";
import type { ChatAttachment, ChatMember, ChatMessage, ChatPin } from "@/lib/queries/chat";
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

/** How long a typing signal stands before it is assumed stale, and how often
 * one is sent. The gap between them is deliberate: at one signal every two
 * seconds and a four-second life, somebody typing steadily never flickers,
 * and somebody who stops disappears within about two. */
const TYPING_EVERY = 2000;
const TYPING_TTL = 4000;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** One file in a message. A photo is shown, a video plays in place, anything
 * else is a named chip that opens it. */
function AttachmentView({ a }: { a: ChatAttachment }) {
  if (!a.url) {
    return (
      <span className="kin-filechip" data-broken="true">
        <Icon name="fileText" size="1rem" />
        <span className="kin-filechip-name">{a.fileName}</span>
        <span className="kin-filechip-size">couldn&rsquo;t load</span>
      </span>
    );
  }
  if (a.mimeType.startsWith("image/")) {
    return (
      <a className="kin-attachment-photo" href={a.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL
            that expires in half an hour gains nothing from the image
            optimiser, which would cache it past its own expiry. */}
        <img src={a.url} alt={a.fileName} loading="lazy" decoding="async" />
      </a>
    );
  }
  if (a.mimeType.startsWith("video/")) {
    return <video className="kin-attachment-video" src={a.url} controls preload="metadata" playsInline aria-label={a.fileName} />;
  }
  return (
    <a className="kin-filechip" href={a.url} target="_blank" rel="noopener noreferrer">
      <Icon name="fileText" size="1rem" />
      <span className="kin-filechip-name">{a.fileName}</span>
      <span className="kin-filechip-size">{formatBytes(a.sizeBytes)}</span>
    </a>
  );
}

/** "seen by Janine", "seen by Janine and Amelia", "seen by everyone". Naming
 * three or more people is a list nobody reads; "everyone" is the fact they
 * wanted. */
function seenLabel(ids: string[], byId: Map<string, { label: string }>, householdSize: number) {
  const names = ids.map((id) => byId.get(id)?.label).filter((n): n is string => !!n);
  if (names.length === 0) return "";
  // Everyone but the author, who never appears in seenBy.
  if (names.length >= householdSize - 1) return "everyone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/** The household's thread. Messages arrive as they are sent — the page holds
 * a live subscription rather than waiting for a refresh — and anyone can be
 * tagged by name, which is what makes a message reach the right person in a
 * room where everyone is listening. */
export function ChatThread({
  me,
  familyId,
  members,
  initial,
  pin,
}: {
  me: string;
  familyId: string;
  members: (ChatMember & { label: string })[];
  initial: ChatMessage[];
  pin: ChatPin;
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
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  /** Files picked and not yet sent, with a local preview for the images. */
  const [picked, setPicked] = useState<{ file: File; preview: string | null }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Member ids currently typing, against the instant their signal goes
   * stale. Nothing here is persisted: a typing indicator that outlives the
   * typing is worse than none. */
  const [typing, setTyping] = useState<Record<string, number>>({});
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
  //
  // The channel is named per household. It used to be the bare string
  // "family-chat", which every household in the app joined -- row-level
  // security meant nobody saw anybody else's data, because each refresh
  // re-fetched under their own policies, but every family still woke up for
  // every other family's messages. A broadcast channel has no such backstop,
  // so the typing signal below could not have been added to a shared one at
  // all.
  //
  // The payload is a member id and nothing else. Whoever could join this
  // channel already knows the household's id, and an id on its own resolves
  // to a name only against the member list, which is fetched under RLS.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`family-chat:${familyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "family_message_reactions" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "family_chat_pins" }, () => router.refresh())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { id?: string })?.id;
        if (!who || who === me) return;
        setTyping((prev) => ({ ...prev, [who]: Date.now() + TYPING_TTL }));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [router, familyId, me]);

  // A preview is an object URL, which holds the whole file in memory until it
  // is released. Released when the set changes and when the thread goes.
  useEffect(() => {
    return () => {
      for (const p of picked) if (p.preview) URL.revokeObjectURL(p.preview);
    };
  }, [picked]);

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setPicked((prev) => [...prev, ...next].slice(0, 10));
    if (fileInput.current) fileInput.current.value = "";
  };

  // Sweeps expired signals. A sender that closes the tab mid-word sends no
  // retraction, so the only thing that can end an indicator is time.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  // One signal per TYPING_EVERY at most, however fast somebody types.
  const lastTypingSent = useRef(0);
  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_EVERY) return;
    lastTypingSent.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { id: me } });
  }, [me]);

  // No expiry check here on purpose: reading the clock during render is
  // impure, and the sweep above already drops stale ids once a second. The
  // cost is that an indicator can outlive its signal by up to that second,
  // against a four-second life.
  const typingNames = Object.keys(typing)
    .map((id) => byId.get(id)?.label)
    .filter((n): n is string => !!n);

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
    const files = picked;
    if (!body && files.length === 0) return;
    // Only tags still standing in the text count.
    const stillThere = mentioned.filter((id) => body.includes(`@${byId.get(id)?.label ?? ""}`));
    const answering = replyingTo?.id ?? null;
    setDraft("");
    setMentioned([]);
    setReplyingTo(null);
    setPendingBody(body || (files.length === 1 ? "Sending a file…" : `Sending ${files.length} files…`));
    setError(null);
    startTransition(async () => {
      // Files first, straight to Storage. The message is only written once
      // every one of them has landed, so a thread never shows "here's the
      // photo" with the photo still on its way -- or never arriving.
      let attachments: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          const uploaded = await Promise.all(files.map((p) => uploadFileDirect(p.file, "chat")));
          attachments = uploaded.map((u, i) => ({
            storagePath: u.provider === "supabase" ? u.storagePath : "",
            fileName: files[i].file.name,
            mimeType: files[i].file.type,
            sizeBytes: files[i].file.size,
          }));
        } catch (e) {
          setUploading(false);
          setError(e instanceof Error ? e.message : "A file didn't upload.");
          setPendingBody(null);
          setDraft(body);
          return;
        }
        setUploading(false);
      }

      const result = await sendMessageAction({ body, mentions: stillThere, replyTo: answering, attachments });
      if (result.error) {
        setError(result.error);
        setPendingBody(null);
        setDraft(body);
        return;
      }
      setPicked([]);
      // Both inside the transition, so the optimistic bubble is only taken
      // away in the same commit that brings the real one in.
      router.refresh();
      setPendingBody(null);
    });
  }, [draft, mentioned, byId, router, replyingTo, picked]);

  const act = (fn: () => Promise<{ error: string | null }>) => {
    setOpenFor(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  // Resolved from the thread rather than fetched on its own: a pin pointing
  // at something outside the loaded window would be a banner you cannot scroll
  // to, which is worse than no banner.
  const pinned = pin ? (messages.find((m) => m.id === pin.messageId) ?? null) : null;

  /** The newest message of your own, which is the only one that carries a
   * "seen by". */
  const lastMine = [...messages].reverse().find((m) => m.memberId === me && !m.deleted)?.id ?? null;

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
      {/* The thing on the fridge door. It sits above the thread rather than
          inside it, because the whole point is that it does not scroll away. */}
      {pinned && (
        <div className="kin-chatpin">
          <Icon name="mapPin" size="0.875rem" style={{ flex: "none", color: "var(--color-accent-700)" }} />
          <button
            type="button"
            className="kin-chatpin-body"
            onClick={() => document.getElementById(`msg-${pinned.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
          >
            <span className="kin-chatpin-who">{pinned.memberId ? (byId.get(pinned.memberId)?.label ?? "Someone") : "Someone"}</span>
            <span className="kin-chatpin-text">{pinned.deleted ? "Message withdrawn" : pinned.body}</span>
          </button>
          <button type="button" className="btn btn-ghost kin-chatpin-off" onClick={() => act(() => unpinMessageAction())}>
            Unpin
          </button>
        </div>
      )}

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
            <div key={m.id} id={`msg-${m.id}`}>
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

                  {/* What this answers. Tapping it goes there, which is the
                      whole reason a quote is worth the room it takes. */}
                  {m.replyTo && !m.deleted && (
                    <button
                      type="button"
                      className="kin-quote"
                      data-mine={mine || undefined}
                      onClick={() => document.getElementById(`msg-${m.replyTo!.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                    >
                      <span className="kin-quote-who">
                        {m.replyTo.memberId ? (byId.get(m.replyTo.memberId)?.label ?? "Someone") : "Someone"}
                      </span>
                      <span className="kin-quote-text">{m.replyTo.deleted ? "Message withdrawn" : m.replyTo.excerpt}</span>
                    </button>
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
                    <>
                      {/* Files sit above the words, as a caption sits under a
                          photo. Outside the bubble on purpose: the bubble is a
                          button, and a link or a video's own controls inside
                          a button is not valid and does not work on a phone. */}
                      {m.attachments.length > 0 && !m.deleted && (
                        <div className="kin-attachments" data-mine={mine || undefined} data-count={Math.min(m.attachments.length, 4)}>
                          {m.attachments.map((a) => (
                            <AttachmentView key={a.id} a={a} />
                          ))}
                        </div>
                      )}

                      {m.deleted || m.body ? (
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
                      ) : (
                        /* A photo with no words has no bubble to tap, so it
                           gets the same menu from a button of its own. */
                        <button
                          type="button"
                          className="btn btn-ghost kin-attachments-more"
                          onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                          aria-label={`Options for ${mine ? "your" : `${author?.label ?? "someone"}'s`} ${m.attachments.length === 1 ? "file" : "files"}`}
                        >
                          ···
                        </button>
                      )}
                    </>
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
                      <span style={{ width: 1, height: 18, background: "var(--color-divider)", margin: "0 3px" }} />
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(m);
                          setOpenFor(null);
                          input.current?.focus();
                        }}
                        className="btn btn-ghost"
                        style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => act(() => (pin?.messageId === m.id ? unpinMessageAction() : pinMessageAction(m.id)))}
                        className="btn btn-ghost"
                        style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                      >
                        {pin?.messageId === m.id ? "Unpin" : "Pin"}
                      </button>
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
                    {/* Only on your own, and only the latest one. Every message
                        carrying its own list turns a thread into a register of
                        who is ignoring whom; the last one answers the question
                        anybody actually has, which is whether it landed. */}
                    {mine && !m.deleted && m.id === lastMine && m.seenBy.length > 0 && (
                      <> · seen by {seenLabel(m.seenBy, byId, members.length)}</>
                    )}
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
        {/* Who is typing. Above the composer rather than in the thread, so it
            never pushes the conversation around as it comes and goes. */}
        {typingNames.length > 0 && (
          <p className="kin-typing" aria-live="polite">
            {typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.slice(0, 2).join(" and ")} are typing`}
            <span className="kin-typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}

        {/* What is about to go with the message. */}
        {picked.length > 0 && (
          <div className="kin-picked">
            {picked.map((p, i) => (
              <span key={`${p.file.name}-${i}`} className="kin-picked-item">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something to optimise.
                  <img src={p.preview} alt={p.file.name} />
                ) : (
                  <span className="kin-picked-file">
                    <Icon name="fileText" size="1rem" />
                    <span>{p.file.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="kin-picked-off"
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                  disabled={uploading}
                >
                  <Icon name="x" size="0.75rem" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* What you are answering, with a way out of it. */}
        {replyingTo && (
          <div className="kin-replystrip">
            <span className="kin-quote-who">
              Replying to {replyingTo.memberId === me ? "yourself" : (byId.get(replyingTo.memberId ?? "")?.label ?? "someone")}
            </span>
            <span className="kin-quote-text">{replyingTo.deleted ? "Message withdrawn" : replyingTo.body}</span>
            <button type="button" className="btn btn-ghost kin-replystrip-off" onClick={() => setReplyingTo(null)} aria-label="Stop replying">
              <Icon name="x" size="0.875rem" />
            </button>
          </div>
        )}
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

        <div className="kin-composer-row">
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            aria-label="Tag someone"
            onClick={() => {
              setDraft((d) => `${d}${d.endsWith(" ") || d === "" ? "" : " "}@`);
              input.current?.focus();
            }}
          >
            <span style={{ font: "600 1.0625rem/1 var(--font-heading)" }}>@</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            aria-label="Attach a photo or file"
            disabled={uploading || picked.length >= 10}
            onClick={() => fileInput.current?.click()}
          >
            <Icon name="paperclip" size="1.0625rem" />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(e) => pickFiles(e.target.files)}
          />
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value) signalTyping();
            }}
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
            className="input kin-composer-field"
            style={{ minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "0.9375rem", resize: "none", paddingTop: "0.5625rem" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            disabled={uploading || (!draft.trim() && picked.length === 0)}
            onClick={send}
            aria-label={uploading ? "Sending" : "Send"}
          >
            <Icon name="upload" size="1rem" />
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
