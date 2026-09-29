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
  const [picked, setPicked] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ photos: RoomMessage["photos"]; index: number } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Previews are object URLs; hand each back when it leaves the tray.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);

  const pick = (list: FileList | null) => {
    const images = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length < (list?.length ?? 0)) setError("Only photos can be sent here.");
    setPicked((prev) => [...prev, ...images.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
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
      const r = room.kind === "family" ? await sendFamilyMessageAction(body, photos) : await sendDirectMessageAction(room.personId, body, photos);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      } else {
        setPicked([]);
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
                {m.photos.length > 0 && (
                  <div className="kin-attachments" data-count={Math.min(m.photos.length, 4)}>
                    {m.photos.map((p, i) =>
                      p.url ? (
                        <button key={p.id} type="button" className="kin-attachment-photo" onClick={() => setViewing({ photos: m.photos, index: i })} aria-label={`Open photo ${p.fileName}`}>
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
                  <span className="kin-bubble" data-mine={m.mine || undefined} style={{ cursor: "default", whiteSpace: "pre-wrap" }}>
                    {m.body}
                  </span>
                )}
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

      {viewing && (
        <PhotoViewer
          items={viewing.photos.filter((p) => p.url).map((p) => ({ url: p.url!, alt: p.fileName }))}
          startIndex={viewing.photos.filter((p) => p.url).findIndex((p) => p.id === viewing.photos[viewing.index].id)}
          onClose={() => setViewing(null)}
          label="Photo from chat"
        />
      )}

      {canWrite ? (
        <div className="kin-glass-bar kin-composer">
          {picked.length > 0 && (
            <div className="kin-room-tray" aria-label="Photos to send">
              {picked.map((p, i) => (
                <span key={p.preview} className="kin-room-tray-item">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not yet sent */}
                  <img src={p.preview} alt="" />
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
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              disabled={pending || picked.length >= MAX_PHOTOS}
              onClick={() => fileInput.current?.click()}
              aria-label="Add photos"
            >
              <Icon name="camera" size="1.125rem" />
            </button>
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
              disabled={pending || (!draft.trim() && picked.length === 0)}
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
