"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSavedMessageAction, sendSavedMessageAction, type RoomPhoto } from "@/lib/actions/chat-rooms";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { ForwardSheet } from "@/components/forward-sheet";
import { VoiceTranscript } from "@/components/room-thread";
import { uploadFileDirect } from "@/lib/upload-client";
import type { RoomMessage } from "@/lib/queries/chat-rooms";

/** At most this many photos on one note, as in every conversation. */
const MAX_PHOTOS = 10;

/** Saved messages (20261006100200): a conversation with yourself. Notes,
 * links, photos, and anything forwarded here from another chat. Nobody else
 * can read it -- not the household, not a parent -- so there is no one to
 * notify, no reactions, no typing, and no live channel: what changes here is
 * only ever changed by you, on this screen. */
export function SavedThread({ messages }: { messages: RoomMessage[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<{ file: File; preview: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<RoomMessage | null>(null);
  const [viewing, setViewing] = useState<{ photos: RoomMessage["photos"]; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);

  const pick = (list: FileList | null) => {
    const media = Array.from(list ?? []).filter((f) => /^(image|video)\//.test(f.type));
    if (media.length < (list?.length ?? 0)) setError("Only photos and videos can be saved here.");
    setPicked((prev) => [...prev, ...media.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS));
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = () => {
    const body = draft.trim();
    const files = picked;
    if (!body && files.length === 0) return;
    setDraft("");
    setError(null);
    startTransition(async () => {
      let photos: RoomPhoto[] = [];
      if (files.length > 0) {
        try {
          const uploaded = await Promise.all(files.map((p) => uploadFileDirect(p.file, "chat")));
          photos = uploaded.map((u, i) => ({
            storagePath: u.provider === "supabase" ? u.storagePath : "",
            fileName: files[i].file.name,
            mimeType: files[i].file.type,
            sizeBytes: files[i].file.size,
          }));
        } catch (e) {
          setError(e instanceof Error ? e.message : "A photo didn't upload.");
          setDraft(body);
          return;
        }
      }
      const r = await sendSavedMessageAction(body, photos);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      } else setPicked([]);
      router.refresh();
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      setActive(null);
      const r = await deleteSavedMessageAction(id);
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
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2rem 1rem", lineHeight: 1.5 }}>
            Notes, links and photos for yourself. Forward anything here from another chat to keep it. Only you can see this.
          </p>
        )}
        {rows.map(({ m, day, showDay }) => (
          <div key={m.id} id={`msg-${m.id}`}>
            {showDay && <div className="kin-linkthread-day">{day}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                {m.forwardedFrom && (
                  <span className="kin-forwarded">
                    <Icon name="upload" size="0.75rem" /> Forwarded from {m.forwardedFrom}
                  </span>
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
                      ) : null,
                    )}
                  </div>
                )}
                {m.body ? (
                  <button
                    type="button"
                    className="kin-bubble"
                    data-mine
                    style={{ whiteSpace: "pre-wrap", textAlign: "left", font: "inherit", border: 0 }}
                    aria-expanded={active === m.id}
                    onClick={() => setActive((a) => (a === m.id ? null : m.id))}
                  >
                    {m.body}
                  </button>
                ) : null}
                {active === m.id && (
                  <span className="kin-room-actions" role="group" aria-label="Note actions">
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
                    <button type="button" className="kin-room-actions-word" data-danger disabled={pending} onClick={() => remove(m.id)}>
                      Delete
                    </button>
                  </span>
                )}
                <span className="kin-linkthread-time">
                  {familyClock(new Date(m.createdAt))}
                  {!m.body && (
                    <button type="button" className="kin-linkthread-delete" onClick={() => setActive((a) => (a === m.id ? null : m.id))}>
                      More
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
          startIndex={Math.max(0, viewing.photos.filter((p) => p.url).findIndex((p) => p.id === viewing.id))}
          onClose={() => setViewing(null)}
          label="Saved photo"
        />
      )}

      <ForwardSheet
        source={forwarding ? { kind: "saved", id: forwarding.id } : null}
        preview={forwarding ? (forwarding.body || `${forwarding.photos.length} attachment${forwarding.photos.length === 1 ? "" : "s"}`).replace(/\s+/g, " ").slice(0, 120) : ""}
        onClose={() => setForwarding(null)}
      />

      <div className="kin-glass-bar kin-composer">
        {picked.length > 0 && (
          <div className="kin-room-tray" aria-label="Photos to save">
            {picked.map((p, i) => (
              <span key={p.preview} className="kin-room-tray-item">
                {p.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not yet saved
                  <img src={p.preview} alt="" />
                ) : (
                  <video src={p.preview} muted playsInline preload="metadata" />
                )}
                <button type="button" aria-label="Remove this photo" disabled={pending} onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}>
                  <Icon name="x" size="0.75rem" />
                </button>
              </span>
            ))}
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
            className="input kin-composer-field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
            placeholder="Note to self…"
            rows={1}
            maxLength={4000}
            aria-label="Note to self"
            style={{ minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "1rem", resize: "none", paddingTop: "0.5625rem" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            disabled={pending || (!draft.trim() && picked.length === 0)}
            onClick={save}
            aria-label="Save"
          >
            <Icon name="upload" size="1rem" />
          </button>
        </div>
      </div>
    </div>
  );
}
