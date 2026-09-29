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
  toggleRoomReactionAction,
} from "@/lib/actions/chat-rooms";
import { REACTIONS } from "@/lib/chat";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { uploadFileDirect } from "@/lib/upload-client";
import type { RoomMessage } from "@/lib/queries/chat-rooms";
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
  seenAt = null,
}: {
  room: { kind: "family" } | { kind: "dm"; personId: string; low: string; high: string };
  messages: RoomMessage[];
  topic: string;
  placeholder: string;
  emptyText: string;
  canWrite?: boolean;
  /** One to one: when the other person last read this conversation. */
  seenAt?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ photos: RoomMessage["photos"]; id: string } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<RoomMessage | null>(null);
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
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecordingSince(null);
      const seconds = (Date.now() - started) / 1000;
      if (seconds < 0.8 || chunks.length === 0) return;
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File(chunks, `Voice note ${Math.round(seconds)}s.${ext}`, { type });
      setPicked((prev) => [...prev, { file, preview: URL.createObjectURL(file) }].slice(0, MAX_PHOTOS));
    };
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
        // Photos are indexed just after their message, so the message can
        // arrive a beat before them; this brings them in when they land.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_room_attachments" }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_reactions" }, () => router.refresh())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, table, filter, router]);

  const send = () => {
    const body = draft.trim();
    const files = picked;
    if (!body && files.length === 0) return;
    setDraft("");
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
      const r =
        room.kind === "family"
          ? await sendFamilyMessageAction(body, photos, answering)
          : await sendDirectMessageAction(room.personId, body, photos, answering);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      } else {
        setPicked([]);
        setReplyingTo(null);
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

  const react = (id: string, emoji: string) =>
    startTransition(async () => {
      setActive(null);
      const r = await toggleRoomReactionAction(room.kind, id, emoji);
      if (r.error) setError(r.error);
      router.refresh();
    });

  // "Seen" goes under your newest message they have read, once, the way a
  // phone's messages app shows it.
  const lastSeenMine = seenAt ? [...messages].reverse().find((m) => m.mine && m.createdAt <= seenAt)?.id : undefined;

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
                {m.replyTo && (
                  <span className="kin-room-quote">
                    <strong>{m.replyTo.authorName}</strong> {m.replyTo.excerpt}
                  </span>
                )}
                {m.photos.length > 0 && (
                  <div className="kin-attachments" data-count={Math.min(m.photos.length, 4)}>
                    {m.photos.map((p) =>
                      p.url && p.mimeType.startsWith("audio/") ? (
                        <span key={p.id} className="kin-attachment-audio">
                          <Icon name="mic" size="1rem" />
                          <audio src={p.url} controls preload="metadata" aria-label={p.fileName} />
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
                {m.body && (
                  // Tapping a message opens its reactions and Reply, as in
                  // the household chat.
                  <button
                    type="button"
                    className="kin-bubble"
                    data-mine={m.mine || undefined}
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
                        disabled={pending || !canWrite}
                        onClick={() => react(m.id, r.emoji)}
                        aria-label={`${r.emoji} from ${r.names.join(", ")}`}
                        title={r.names.join(", ")}
                      >
                        {r.emoji} {r.names.length > 1 ? r.names.length : ""}
                      </button>
                    ))}
                  </span>
                )}
                {active === m.id && canWrite && (
                  <span className="kin-room-actions" role="group" aria-label="React or reply">
                    {REACTIONS.map((e) => (
                      <button key={e} type="button" disabled={pending} onClick={() => react(m.id, e)} aria-label={`React ${e}`}>
                        {e}
                      </button>
                    ))}
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
                  </span>
                )}
                <span className="kin-linkthread-time">
                  {familyClock(new Date(m.createdAt))}
                  {m.photos.length > 0 && !m.body && canWrite && (
                    <button type="button" className="kin-linkthread-delete" onClick={() => setActive((a) => (a === m.id ? null : m.id))}>
                      React
                    </button>
                  )}
                  {m.mine && (
                    <button type="button" className="kin-linkthread-delete" disabled={pending} onClick={() => remove(m.id)}>
                      Delete
                    </button>
                  )}
                  {m.id === lastSeenMine && <span className="kin-room-seen"> · Seen</span>}
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

      {viewing && (
        <PhotoViewer
          items={viewing.photos.filter((p) => p.url).map((p) => ({ url: p.url!, alt: p.fileName }))}
          startIndex={Math.max(0, viewing.photos.filter((p) => p.url).findIndex((p) => p.id === viewing.id))}
          onClose={() => setViewing(null)}
          label="Photo from chat"
        />
      )}

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
          <div className="kin-composer-row">
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
          You&rsquo;re no longer connected, so nothing new can be sent here.
        </p>
      )}
    </div>
  );
}
