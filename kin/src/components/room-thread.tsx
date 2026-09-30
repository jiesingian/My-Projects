"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  deleteDirectMessageAction,
  deleteFamilyMessageAction,
  markThreadReadAction,
  sendDirectMessageAction,
  sendFamilyMessageAction,
  sendGroupMessageAction,
  deleteGroupMessageAction,
  toggleRoomReactionAction,
  editRoomMessageAction,
  unsendRoomMessageAction,
  pinRoomMessageAction,
  sendGroupPollAction,
  voteGroupPollAction,
} from "@/lib/actions/chat-rooms";
import { REACTIONS } from "@/lib/chat";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { SaveToJournalButton } from "@/components/save-to-journal";
import { ForwardSheet } from "@/components/forward-sheet";
import { uploadFileDirect } from "@/lib/upload-client";
import { CONFLICT_MESSAGE, recordingIsSilent, rememberTranscriptConflict, startTranscript } from "@/lib/voice-note";
import type { RoomMessage, RoomPoll } from "@/lib/queries/chat-rooms";
import type { RoomPhoto } from "@/lib/actions/chat-rooms";

/** As in the household chat: beyond this a message becomes an album. */
const MAX_PHOTOS = 10;

/** The family-tree room, or a conversation with one person (29 September).
 * Plainer than the household chat on purpose, like the linked-household
 * thread it is modelled on: words and photos, live, with a notification --
 * the house's polls, albums and shopping lists stay in the house's own chat.
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
  saveFrom = "chat",
  canReact = canWrite,
  readOnlyNote = "You’re no longer connected, so nothing new can be sent here.",
  seenAt = null,
  seenBy = [],
  me,
  mentionable = [],
}: {
  room: { kind: "family" } | { kind: "dm"; personId: string; low: string; high: string } | { kind: "group"; groupId: string; isAdmin: boolean };
  messages: RoomMessage[];
  topic: string;
  placeholder: string;
  emptyText: string;
  canWrite?: boolean;
  /** What a photo saved to the Journal says it came from ("Family", a name). */
  saveFrom?: string;
  /** An announcement channel lets everyone react, but only admins post. */
  canReact?: boolean;
  /** What shows where the message box would be, when writing is closed. */
  readOnlyNote?: string;
  /** One to one: when the other person last read this conversation. */
  seenAt?: string | null;
  /** A group: who else has opened it, and when (20261006100000). */
  seenBy?: { firstName: string; lastReadAt: string }[];
  /** Who is reading, for the typing signal on the channel's presence. */
  me: { personId: string; firstName: string };
  /** People who can be @-named here besides those who have written (a
   * group's members). One to one has no mentions. */
  mentionable?: { personId: string; firstName: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<{ file: File; preview: string; transcript?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ photos: RoomMessage["photos"]; id: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<RoomMessage | null>(null);
  const [forwarding, setForwarding] = useState<RoomMessage | null>(null);
  /** Your own message being rewritten in place (20260930150100). */
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  /** The message a quote was tapped for, lit for a moment where it lands. */
  const [found, setFound] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A voice note, recorded in the browser and then treated exactly like a
  // picked file -- the household chat's recorder, the same limits.
  const recorder = useRef<MediaRecorder | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [recordedFor, setRecordedFor] = useState(0);
  const startRecording = async () => {
    if (typeof window === "undefined" || !("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Kin needs the microphone to record a voice note. It can be allowed in the browser's site settings.");
      return;
    }
    // iOS Safari records mp4, most others webm.
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecordingSince(null);
      const words = transcript.finish();
      const seconds = (Date.now() - started) / 1000;
      if (seconds < 0.8 || chunks.length === 0) return;
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File(chunks, `Voice note ${Math.round(seconds)}s.${ext}`, { type });
      // Some phones can't transcribe and record at once, and the recording
      // loses. Then the words are what's left: they go in the message box to
      // send as text, rather than a silent note going out.
      if (words && (await recordingIsSilent(file))) {
        setDraft((d) => (d ? `${d} ${words}` : words));
        rememberTranscriptConflict();
        setError(CONFLICT_MESSAGE);
        return;
      }
      setPicked((prev) => [...prev, { file, preview: URL.createObjectURL(file), transcript: words || undefined }].slice(0, MAX_PHOTOS));
    };
    // Written down while it records (src/lib/voice-note.ts).
    const transcript = startTranscript();
    recorder.current = rec;
    rec.start();
    setRecordedFor(0);
    setRecordingSince(started);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();
  // The clock, and a hard stop at two minutes: a note left running in a
  // pocket should not become a forty-minute upload.
  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - recordingSince) / 1000;
      setRecordedFor(seconds);
      if (seconds >= 120 && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recordingSince]);

  // Previews are object URLs; hand each back when it leaves the tray.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);

  const pick = (list: FileList | null) => {
    const media = Array.from(list ?? []).filter((f) => /^(image|video)\//.test(f.type));
    if (media.length < (list?.length ?? 0)) setError("Only photos and videos can be sent here.");
    setPicked((prev) => [...prev, ...media.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
    if (fileInput.current) fileInput.current.value = "";
  };
  const readKey = room.kind === "family" ? "family" : room.kind === "dm" ? (`dm:${room.personId}` as const) : (`group:${room.groupId}` as const);
  const table = room.kind === "family" ? "family_tree_messages" : room.kind === "dm" ? "direct_messages" : "chat_group_messages";
  const filter = room.kind === "dm" ? `person_low=eq.${room.low}` : room.kind === "group" ? `group_id=eq.${room.groupId}` : undefined;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    // Seeing it is reading it, including what arrives while it is open.
    void markThreadReadAction(readKey);
  }, [messages.length, readKey]);

  /** First names of whoever is typing here now, from the channel's presence
   * (20261006100000). Nothing is stored: a typing indicator that outlives
   * the typing is worse than none. */
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const typingSince = useRef(0);
  const typingStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTyping = useCallback(() => {
    typingSince.current = 0;
    if (typingStop.current) clearTimeout(typingStop.current);
    void channelRef.current?.track({ name: me.firstName, typing: false });
  }, [me.firstName]);
  const signalTyping = useCallback(
    (typing: boolean) => {
      const ch = channelRef.current;
      if (!ch) return;
      if (!typing) return stopTyping();
      // One track call per few seconds however fast somebody types.
      const now = Date.now();
      if (now - typingSince.current > 3000) {
        typingSince.current = now;
        void ch.track({ name: me.firstName, typing: true });
      }
      if (typingStop.current) clearTimeout(typingStop.current);
      typingStop.current = setTimeout(stopTyping, 4000);
    },
    [me.firstName, stopTyping],
  );

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth().catch(() => {});
      if (cancelled) return;
      channel = supabase
        .channel(topic, { config: { private: true, presence: { key: me.personId } } })
        .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => router.refresh())
        // Photos are indexed just after their message, so the message can
        // arrive a beat before them; this brings them in when they land.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_room_attachments" }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_reactions" }, () => router.refresh())
        // Votes on a group's polls (20261006100300); row-level security sends
        // only this person's groups' votes.
        .on("postgres_changes", { event: "*", schema: "public", table: "group_poll_votes" }, () => router.refresh())
        // Typing, on the same private channel: only people who may read this
        // conversation can join it (chat_topic_is_mine).
        .on("presence", { event: "sync" }, () => {
          const state = channel?.presenceState<{ name: string; typing: boolean }>() ?? {};
          setTypingNames(
            Object.entries(state)
              .filter(([key, metas]) => key !== me.personId && metas.some((x) => x.typing))
              .map(([, metas]) => metas[0].name),
          );
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void channel?.track({ name: me.firstName, typing: false });
        });
      channelRef.current = channel;
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, table, filter, router, me.personId, me.firstName]);

  // @mentions (20261006100100): anyone who has written here, plus the
  // group's members; never yourself, never in one to one.
  const [mentioned, setMentioned] = useState<string[]>([]);
  const candidates = (() => {
    if (room.kind === "dm") return [];
    const seen = new Map<string, string>();
    for (const p of mentionable) if (p.personId !== me.personId) seen.set(p.personId, p.firstName);
    for (const m of messages)
      if (m.authorPersonId && !m.mine && !seen.has(m.authorPersonId)) seen.set(m.authorPersonId, m.authorName.split(" ")[0] || "Someone");
    return [...seen.entries()].map(([personId, firstName]) => ({ personId, firstName }));
  })();
  const mentionQuery = /(?:^|\s)@([^\s@]*)$/.exec(draft)?.[1];
  const suggestions =
    mentionQuery === undefined ? [] : candidates.filter((c) => c.firstName.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 5);
  const pickMention = (c: { personId: string; firstName: string }) => {
    setDraft((d) => d.replace(/@([^\s@]*)$/, `@${c.firstName} `));
    setMentioned((prev) => (prev.includes(c.personId) ? prev : [...prev, c.personId]));
    textArea.current?.focus();
  };

  // A poll, in a group (20261006100300).
  const [asking, setAsking] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const ask = () => {
    if (room.kind !== "group") return;
    const question = pollQuestion.trim();
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      setError("A poll needs a question and at least two answers.");
      return;
    }
    startTransition(async () => {
      const r = await sendGroupPollAction(room.groupId, question, options, pollMultiple);
      if (r.error) setError(r.error);
      else {
        setAsking(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setPollMultiple(false);
      }
      router.refresh();
    });
  };
  const vote = (poll: RoomPoll, optionId: string) =>
    startTransition(async () => {
      const r = await voteGroupPollAction(poll.id, optionId);
      if (r.error) setError(r.error);
      router.refresh();
    });

  const send = () => {
    const body = draft.trim();
    const files = picked;
    if (!body && files.length === 0) return;
    setDraft("");
    stopTyping();
    setError(null);
    startTransition(async () => {
      // Photos first, straight from the phone to Storage; the message is only
      // written once every one has landed.
      let photos: RoomPhoto[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          const uploaded = await Promise.all(files.map((p) => uploadFileDirect(p.file, "chat")));
          photos = uploaded.map((u, i) => ({
            storagePath: u.provider === "supabase" ? u.storagePath : "",
            fileName: files[i].file.name,
            mimeType: files[i].file.type,
            sizeBytes: files[i].file.size,
            transcript: files[i].transcript,
          }));
        } catch (e) {
          setUploading(false);
          setError(e instanceof Error ? e.message : "A photo didn't upload.");
          setDraft(body);
          return;
        }
        setUploading(false);
      }
      const answering = replyingTo?.id ?? null;
      // Only names still in the words count: a tag deleted while typing
      // notifies nobody.
      const named = mentioned.filter((id) => {
        const c = candidates.find((x) => x.personId === id);
        return c && body.includes(`@${c.firstName}`);
      });
      const r =
        room.kind === "family"
          ? await sendFamilyMessageAction(body, photos, answering, null, named)
          : room.kind === "dm"
            ? await sendDirectMessageAction(room.personId, body, photos, answering)
            : await sendGroupMessageAction(room.groupId, body, photos, answering, null, named);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      } else {
        setPicked([]);
        setReplyingTo(null);
        setMentioned([]);
      }
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const r =
        room.kind === "family"
          ? await deleteFamilyMessageAction(id)
          : room.kind === "dm"
            ? await deleteDirectMessageAction(id)
            : await deleteGroupMessageAction(id);
      if (r.error) setError(r.error);
      router.refresh();
    });

  // Your own message is unsent (everyone sees "Message removed"); a group
  // admin taking down someone else's still deletes it outright.
  const unsend = (id: string) =>
    startTransition(async () => {
      setActive(null);
      const r = await unsendRoomMessageAction(room.kind, id);
      if (r.error) setError(r.error);
      router.refresh();
    });

  const saveEdit = () => {
    if (!editing) return;
    const { id, body } = editing;
    setEditing(null);
    startTransition(async () => {
      const r = await editRoomMessageAction(room.kind, id, body);
      if (r.error) setError(r.error);
      router.refresh();
    });
  };

  // Several can be pinned; the banner shows the most recent, as Telegram's
  // does (20260930160000). A channel's members read it; only admins pin.
  const canPin = room.kind === "group" ? canWrite || room.isAdmin : canReact;
  const pinnedMessage = messages
    .filter((m) => m.pinnedAt && !m.removed)
    .sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""))[0];
  const pin = (id: string, on: boolean) =>
    startTransition(async () => {
      setActive(null);
      const r = await pinRoomMessageAction(room.kind, id, on);
      if (r.error) setError(r.error);
      router.refresh();
    });

  const react = (id: string, emoji: string) =>
    startTransition(async () => {
      setActive(null);
      const r = await toggleRoomReactionAction(room.kind, id, emoji);
      if (r.error) setError(r.error);
      router.refresh();
    });

  /** Tapping a quote goes to what it quotes, and lights it briefly so the
   * eye finds it -- the household chat's behaviour, now in every room. */
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFound(id);
    setTimeout(() => setFound((f) => (f === id ? null : f)), 1600);
  };

  // Arriving from a search result ("…#msg-<id>"): go straight there.
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    const id = /^#msg-([0-9a-f-]{36})$/i.exec(window.location.hash)?.[1];
    if (!id) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      setFound(id);
      setTimeout(() => setFound((f) => (f === id ? null : f)), 1600);
    }, 120);
    return () => clearTimeout(t);
  }, []);

  // Search inside this conversation (item 7): the words and voice-note
  // transcripts of what is loaded, newest first. Across every chat is
  // /chat/search, whose results now land on the message itself.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const hits =
    searching && q.length >= 2
      ? messages
          .filter((m) => !m.removed && (m.body.toLowerCase().includes(q) || m.photos.some((p) => p.transcript?.toLowerCase().includes(q))))
          .reverse()
          .slice(0, 50)
      : null;
  const closeSearch = () => {
    setSearching(false);
    setQuery("");
  };

  // "Seen" goes under your newest message they have read, once, the way a
  // phone's messages app shows it.
  const lastSeenMine = seenAt ? [...messages].reverse().find((m) => m.mine && m.createdAt <= seenAt)?.id : undefined;
  // A group: "Seen by Mama, Lola" under your newest message anyone has read.
  const groupSeen = (() => {
    if (room.kind !== "group" || seenBy.length === 0) return null;
    const m = [...messages].reverse().find((x) => x.mine && !x.removed && seenBy.some((s) => s.lastReadAt >= x.createdAt));
    if (!m) return null;
    const names = seenBy.filter((s) => s.lastReadAt >= m.createdAt).map((s) => s.firstName);
    return { id: m.id, label: names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` };
  })();

  const rows = messages.map((m, i) => {
    const day = familyDateLong(new Date(m.createdAt));
    const prev = messages[i - 1];
    return { m, day, showDay: !prev || familyDateLong(new Date(prev.createdAt)) !== day };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="kin-chatsearch">
        {searching ? (
          <>
            <input
              className="input kin-chatsearch-field"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this conversation"
              aria-label="Search this conversation"
              autoFocus
            />
            <button type="button" className="btn btn-ghost" onClick={closeSearch}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost kin-chatsearch-open" onClick={() => setSearching(true)}>
            <Icon name="search" size="0.9375rem" /> Search
          </button>
        )}
      </div>
      {hits !== null && (
        <div className="kin-chatsearch-results" role="list" aria-label="Search results">
          {hits.length === 0 ? (
            <p className="kin-chatsearch-empty">Nothing here says &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            hits.map((m) => (
              <button
                key={m.id}
                type="button"
                role="listitem"
                className="kin-chatsearch-hit"
                onClick={() => {
                  closeSearch();
                  jumpTo(m.id);
                }}
              >
                <span className="kin-chatsearch-meta">
                  {m.mine ? "You" : m.authorName.split(" ")[0]} · {familyDateLong(new Date(m.createdAt))}, {familyClock(new Date(m.createdAt))}
                </span>
                <span>{m.body || m.photos.find((p) => p.transcript?.toLowerCase().includes(q))?.transcript || ""}</span>
              </button>
            ))
          )}
        </div>
      )}
      {pinnedMessage && (
        <div className="kin-chatpin">
          <Icon name="mapPin" size="0.875rem" style={{ flex: "none", color: "var(--color-accent-700)" }} />
          <button type="button" className="kin-chatpin-body" onClick={() => jumpTo(pinnedMessage.id)}>
            <span className="kin-chatpin-who">
              {pinnedMessage.mine ? "You" : pinnedMessage.authorName.split(" ")[0]}
              {pinnedMessage.pinnedBy ? ` · pinned by ${pinnedMessage.pinnedBy}` : ""}
            </span>
            <span className="kin-chatpin-text">{pinnedMessage.body || (pinnedMessage.photos.length ? "Photo" : "")}</span>
          </button>
          {canPin && (
            <button type="button" className="btn btn-ghost kin-chatpin-off" disabled={pending} onClick={() => pin(pinnedMessage.id, false)}>
              Unpin
            </button>
          )}
        </div>
      )}
      <div style={{ flex: 1 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2rem 1rem", lineHeight: 1.5 }}>{emptyText}</p>
        )}
        {rows.map(({ m, day, showDay }) => (
          <div key={m.id} id={`msg-${m.id}`} className={found === m.id ? "kin-msg-found" : undefined}>
            {showDay && <div className="kin-linkthread-day">{day}</div>}
            <div style={{ display: "flex", justifyContent: m.mine ? "flex-end" : "flex-start", marginTop: "0.5rem" }}>
              <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start" }}>
                {room.kind !== "dm" && !m.mine && (
                  <span className="kin-linkthread-who">
                    {m.authorName}
                    {m.householdName && !m.ourHousehold ? ` · ${m.householdName}` : ""}
                  </span>
                )}
                {m.forwardedFrom && (
                  <span className="kin-forwarded">
                    <Icon name="upload" size="0.75rem" /> Forwarded from {m.forwardedFrom}
                  </span>
                )}
                {m.replyTo && (
                  <button type="button" className="kin-room-quote" onClick={() => jumpTo(m.replyTo!.id)} aria-label={`Go to the message from ${m.replyTo.authorName}`}>
                    <strong>{m.replyTo.authorName}</strong> {m.replyTo.excerpt}
                  </button>
                )}
                {m.photos.length > 0 && (
                  <div className="kin-attachments" data-count={Math.min(m.photos.length, 4)}>
                    {m.photos.map((p) =>
                      p.url && p.mimeType.startsWith("audio/") ? (
                        <span key={p.id} className="kin-attachment-voice">
                          <span className="kin-attachment-audio">
                            <Icon name="mic" size="1rem" />
                            <audio src={p.url} controls preload="metadata" aria-label={p.fileName} />
                          </span>
                          {p.transcript && <VoiceTranscript text={p.transcript} />}
                        </span>
                      ) : p.url && p.mimeType.startsWith("video/") ? (
                        <video key={p.id} className="kin-attachment-video" src={p.url} controls preload="metadata" playsInline aria-label={p.fileName} />
                      ) : p.url ? (
                        <button
                          key={p.id}
                          type="button"
                          className="kin-attachment-photo"
                          onClick={() => setViewing({ photos: m.photos.filter((x) => x.mimeType.startsWith("image/")), id: p.id })}
                          aria-label={`Open photo ${p.fileName}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived Storage URL */}
                          <img src={p.url} alt={p.fileName} loading="lazy" />
                        </button>
                      ) : (
                        <span key={p.id} className="kin-filechip" data-broken="true">
                          <Icon name="images" size="1rem" />
                          <span className="kin-filechip-name">{p.fileName}</span>
                          <span className="kin-filechip-size">couldn&rsquo;t load</span>
                        </span>
                      ),
                    )}
                  </div>
                )}
                {m.poll && !m.removed ? (
                  <GroupPollCard poll={m.poll} disabled={pending || !canReact} onVote={(o) => vote(m.poll!, o)} onMore={() => setActive((a) => (a === m.id ? null : m.id))} />
                ) : m.removed ? (
                  <span className="kin-bubble kin-bubble-removed" data-mine={m.mine || undefined}>
                    Message removed
                  </span>
                ) : editing?.id === m.id ? (
                  <span className="kin-room-edit">
                    <textarea
                      className="input"
                      value={editing.body}
                      onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        } else if (e.key === "Escape") setEditing(null);
                      }}
                      maxLength={2000}
                      rows={2}
                      autoFocus
                      aria-label="Edit this message"
                    />
                    <span className="kin-room-edit-row">
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button type="button" className="btn btn-primary" disabled={pending || !editing.body.trim()} onClick={saveEdit}>
                        Save
                      </button>
                    </span>
                  </span>
                ) : m.body && (
                  // Tapping a message opens its reactions and Reply, as in
                  // the household chat.
                  <button
                    type="button"
                    className="kin-bubble"
                    data-mine={m.mine || undefined}
                    data-tagged={(m.mentionsMe && !m.mine) || undefined}
                    style={{ whiteSpace: "pre-wrap", textAlign: "left", font: "inherit", border: 0 }}
                    aria-expanded={active === m.id}
                    onClick={() => setActive((a) => (a === m.id ? null : m.id))}
                  >
                    {m.body}
                  </button>
                )}
                {m.reactions.length > 0 && (
                  <span className="kin-room-reactions">
                    {m.reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        data-mine={r.mine || undefined}
                        disabled={pending || !canReact}
                        onClick={() => react(m.id, r.emoji)}
                        aria-label={`${r.emoji} from ${r.names.join(", ")}`}
                        title={r.names.join(", ")}
                      >
                        {r.emoji} {r.names.length > 1 ? r.names.length : ""}
                      </button>
                    ))}
                  </span>
                )}
                {active === m.id && canReact && !m.removed && (
                  <span className="kin-room-actions" role="group" aria-label={canWrite ? "React or reply" : "React"}>
                    {REACTIONS.map((e) => (
                      <button key={e} type="button" disabled={pending} onClick={() => react(m.id, e)} aria-label={`React ${e}`}>
                        {e}
                      </button>
                    ))}
                    {canWrite && (
                      <button
                        type="button"
                        className="kin-room-actions-word"
                        onClick={() => {
                          setReplyingTo(m);
                          setActive(null);
                          textArea.current?.focus();
                        }}
                      >
                        Reply
                      </button>
                    )}
                    <button
                      type="button"
                      className="kin-room-actions-word"
                      onClick={() => {
                        setForwarding(m);
                        setActive(null);
                      }}
                    >
                      Forward
                    </button>
                    {canPin && (
                      <button type="button" className="kin-room-actions-word" disabled={pending} onClick={() => pin(m.id, !m.pinnedAt)}>
                        {m.pinnedAt ? "Unpin" : "Pin"}
                      </button>
                    )}
                    {m.mine && m.body && !m.poll && (
                      <button
                        type="button"
                        className="kin-room-actions-word"
                        onClick={() => {
                          setEditing({ id: m.id, body: m.body });
                          setActive(null);
                        }}
                      >
                        Edit
                      </button>
                    )}
                    {m.mine && (
                      <button type="button" className="kin-room-actions-word" data-danger disabled={pending} onClick={() => unsend(m.id)}>
                        Unsend
                      </button>
                    )}
                  </span>
                )}
                <span className="kin-linkthread-time">
                  {familyClock(new Date(m.createdAt))}
                  {m.editedAt && !m.removed ? " · edited" : ""}
                  {m.photos.length > 0 && !m.body && canReact && (
                    <button type="button" className="kin-linkthread-delete" onClick={() => setActive((a) => (a === m.id ? null : m.id))}>
                      React
                    </button>
                  )}
                  {!m.mine && room.kind === "group" && room.isAdmin && !m.removed && (
                    <button type="button" className="kin-linkthread-delete" disabled={pending} onClick={() => remove(m.id)}>
                      Delete
                    </button>
                  )}
                  {m.id === lastSeenMine && <span className="kin-room-seen"> · Seen</span>}
                  {m.id === groupSeen?.id && <span className="kin-room-seen"> · Seen by {groupSeen.label}</span>}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {typingNames.length > 0 && (
        <p className="kin-room-typing" aria-live="polite">
          {typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames.slice(0, 2).join(" and ")}${typingNames.length > 2 ? " and others" : ""} are typing…`}
        </p>
      )}

      {error && (
        <p role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", margin: "0.375rem 0 0" }}>
          {error}
        </p>
      )}

      {viewing && (
        <PhotoViewer
          items={viewing.photos.filter((p) => p.url).map((p) => ({ url: p.url!, alt: p.fileName }))}
          startIndex={Math.max(0, viewing.photos.filter((p) => p.url).findIndex((p) => p.id === viewing.id))}
          onClose={() => setViewing(null)}
          label="Photo from chat"
          footer={(i) => {
            const p = viewing.photos.filter((x) => x.url)[i];
            return p?.url ? <SaveToJournalButton url={p.url} fileName={p.fileName} from={saveFrom} /> : null;
          }}
        />
      )}

      <ForwardSheet
        source={forwarding ? { kind: room.kind, id: forwarding.id } : null}
        preview={forwarding ? (forwarding.body || (forwarding.photos.length ? `${forwarding.photos.length} attachment${forwarding.photos.length > 1 ? "s" : ""}` : "")).replace(/\s+/g, " ").slice(0, 120) : ""}
        onClose={() => setForwarding(null)}
      />

      {canWrite ? (
        <div className="kin-glass-bar kin-composer">
          {replyingTo && (
            <div className="kin-room-replying">
              <span>
                Replying to <strong>{replyingTo.mine ? "yourself" : replyingTo.authorName.split(" ")[0]}</strong>
                {replyingTo.body ? `: ${replyingTo.body.replace(/\s+/g, " ").slice(0, 80)}` : ""}
              </span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyingTo(null)}>
                <Icon name="x" size="0.875rem" />
              </button>
            </div>
          )}
          {picked.length > 0 && (
            <div className="kin-room-tray" aria-label="Photos to send">
              {picked.map((p, i) => (
                <span key={p.preview} className="kin-room-tray-item">
                  {p.file.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not yet sent
                    <img src={p.preview} alt="" />
                  ) : p.file.type.startsWith("video/") ? (
                    <video src={p.preview} muted playsInline preload="metadata" />
                  ) : (
                    <span className="kin-room-tray-voice">
                      <Icon name="mic" size="1rem" />
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Remove this photo"
                    disabled={pending}
                    onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Icon name="x" size="0.75rem" />
                  </button>
                </span>
              ))}
              {uploading && <span className="kin-room-tray-note">Sending…</span>}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="kin-room-mentions" role="listbox" aria-label="Mention someone">
              {suggestions.map((c) => (
                <button key={c.personId} type="button" role="option" aria-selected={false} onClick={() => pickMention(c)}>
                  @{c.firstName}
                </button>
              ))}
            </div>
          )}
          {asking && room.kind === "group" && (
            <div className="kin-room-pollform">
              <input
                className="input"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question"
                maxLength={200}
                aria-label="Poll question"
                autoFocus
              />
              {pollOptions.map((o, i) => (
                <input
                  key={i}
                  className="input"
                  value={o}
                  onChange={(e) => setPollOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`Answer ${i + 1}`}
                  maxLength={100}
                  aria-label={`Answer ${i + 1}`}
                />
              ))}
              <div className="kin-room-pollform-row">
                {pollOptions.length < 10 && (
                  <button type="button" className="btn btn-ghost" onClick={() => setPollOptions((prev) => [...prev, ""])}>
                    Add an answer
                  </button>
                )}
                <label className="kin-room-pollform-multi">
                  <input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} /> More than one answer
                </label>
              </div>
              <div className="kin-room-pollform-row">
                <button type="button" className="btn btn-secondary" onClick={() => setAsking(false)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={ask}>
                  Ask
                </button>
              </div>
            </div>
          )}
          <div className="kin-composer-row">
            {room.kind === "group" && (
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
                disabled={pending}
                aria-pressed={asking}
                onClick={() => setAsking((a) => !a)}
                aria-label="Ask a poll"
              >
                <Icon name="poll" size="1.125rem" />
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => pick(e.target.files)} />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              disabled={pending || picked.length >= MAX_PHOTOS}
              onClick={() => fileInput.current?.click()}
              aria-label="Add photos or videos"
            >
              <Icon name="camera" size="1.125rem" />
            </button>
            <textarea
              ref={textArea}
              className="input kin-composer-field"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                signalTyping(e.target.value.trim().length > 0);
              }}
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
            {/* Send once there is something to send, the microphone when there
                is not, Stop while it records -- as in the household chat. */}
            {recordingSince !== null ? (
              <button
                type="button"
                className="btn btn-primary btn-icon"
                style={{ width: "auto", minWidth: "2.375rem", height: "2.375rem", flex: "none", padding: "0 0.625rem", gap: "0.375rem" }}
                aria-label="Stop recording"
                data-recording
                onClick={stopRecording}
              >
                <Icon name="stop" size="1rem" />
                <span style={{ fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
                  {Math.floor(recordedFor / 60)}:{String(Math.floor(recordedFor % 60)).padStart(2, "0")}
                </span>
              </button>
            ) : draft.trim() || picked.length > 0 ? (
              <button
                type="button"
                className="btn btn-primary btn-icon"
                style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
                disabled={pending}
                onClick={send}
                aria-label="Send"
              >
                <Icon name="upload" size="1rem" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-icon"
                style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
                disabled={pending}
                onClick={() => void startRecording()}
                aria-label="Record a voice note"
              >
                <Icon name="mic" size="1.0625rem" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "0.75rem 0" }}>
          {readOnlyNote}
        </p>
      )}
    </div>
  );
}

/** A voice note's words, folded away under the player until asked for. */
export function VoiceTranscript({ text }: { text: string }) {
  return (
    <details className="kin-voice-transcript">
      <summary>Transcript</summary>
      <p>{text}</p>
    </details>
  );
}

/** A group poll in the thread (20261006100300): tap an answer to vote or take
 * it back; each answer shows how many and who. */
function GroupPollCard({ poll, disabled, onVote, onMore }: { poll: RoomPoll; disabled: boolean; onVote: (optionId: string) => void; onMore: () => void }) {
  const total = poll.options.reduce((n, o) => n + o.voters.length, 0);
  return (
    <div className="kin-room-poll">
      <button type="button" className="kin-room-poll-q" onClick={onMore}>
        {poll.question}
      </button>
      <span className="kin-room-poll-hint">{poll.allowMultiple ? "Choose any" : "Choose one"}</span>
      {poll.options.map((o) => {
        const share = total ? Math.round((o.voters.length / total) * 100) : 0;
        return (
          <button key={o.id} type="button" className="kin-room-poll-option" data-mine={o.mine || undefined} disabled={disabled} onClick={() => onVote(o.id)} aria-pressed={o.mine}>
            <span className="kin-room-poll-bar" style={{ width: `${share}%` }} aria-hidden="true" />
            <span className="kin-room-poll-label">{o.label}</span>
            <span className="kin-room-poll-count">{o.voters.length || ""}</span>
            {o.voters.length > 0 && <span className="kin-room-poll-who">{o.voters.join(", ")}</span>}
          </button>
        );
      })}
    </div>
  );
}
