"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateJournalEntryAction, attachJournalMediaAction, deleteJournalMediaAction } from "@/lib/actions/journal";
import type { getEntry } from "@/lib/queries/journal";
import { uploadFileDirect, rollbackUpload, type UploadedFile } from "@/lib/upload-client";
import { ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";
import { familyDay } from "@/lib/time";
import { DateInput } from "@/components/date-input";
import { ZoomableImage } from "@/components/zoomable-image";

type Entry = NonNullable<Awaited<ReturnType<typeof getEntry>>>;

export function EditEntryForm({ entry, members }: { entry: Entry; members: Tables<"members">[] }) {
  const uid = useId();
  const [people, setPeople] = useState<string[]>(entry.people.map((p) => p.id));
  const [photos, setPhotos] = useState(entry.photos);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFilesChosen() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    const files = Array.from(fileRef.current?.files ?? []);
    setPreviews(files.filter((f) => f.type.startsWith("image")).map((f) => URL.createObjectURL(f)));
  }

  async function removePhoto(mediaId: string) {
    setRemovingId(mediaId);
    const result = await deleteJournalMediaAction(mediaId);
    setRemovingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPhotos((p) => p.filter((photo) => photo.id !== mediaId));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "");
    const date = String(fd.get("date") ?? familyDay());
    const note = String(fd.get("note") ?? "").trim() || null;

    const updated = await updateJournalEntryAction({ entryId: entry.id, title, date, note, people });
    if (updated.error) {
      setError(updated.error);
      setSaving(false);
      return;
    }

    const files = Array.from(fileRef.current?.files ?? []).filter((f) => f.size > 0);
    for (let i = 0; i < files.length; i++) {
      let uploaded: UploadedFile | undefined;
      try {
        uploaded = await uploadFileDirect(files[i], "journal");
        const mediaType = files[i].type.startsWith("video") ? "video" : "photo";
        const result = await attachJournalMediaAction({ entryId: entry.id, mediaType, takenAt: date, sortOrder: photos.length + i, uploaded });
        if (result.error) throw new Error(result.error);
      } catch (err) {
        if (uploaded) await rollbackUpload(uploaded);
        setError(`Entry saved, but ${(err as Error).message}`);
        setSaving(false);
        return;
      }
    }

    router.push("/journal?view=list");
    router.refresh();
  }

  return (
    <div>
      <DetailHeader backHref="/journal?view=list" eyebrow="HUB 02 · EDIT ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Edit journal entry</h3>
        <form onSubmit={onSubmit}>
          <ErrorText message={error} />
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor={`${uid}-title`}>TITLE</label>
            <input id={`${uid}-title`} aria-label="Title" className="input" name="title" defaultValue={entry.title} required style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor={`${uid}-date`}>DATE</label>
            <DateInput id={`${uid}-date`} aria-label="Date" className="input" name="date" defaultValue={entry.entry_date} required style={{ minHeight: 44 }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Who was there</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
            {members.map((m) => {
              const active = people.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  data-active={active}
                  onClick={() => setPeople((p) => (active ? p.filter((x) => x !== m.id) : [...p, m.id]))}
                >
                  {m.full_name.split(" ")[0]}
                </button>
              );
            })}
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor={`${uid}-note`}>NOTE</label>
            <textarea id={`${uid}-note`} aria-label="Note" className="input" name="note" defaultValue={entry.note ?? ""} placeholder="What happened?" />
          </div>
          {photos.length > 0 && (
            <div className="field" style={{ marginBottom: 10 }}>
              <label>PHOTOS</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {photos.map((p, i) => (
                  <div key={p.id} style={{ position: "relative" }}>
                    <ZoomableImage src={p.url} alt={`Photo ${i + 1}`} style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      className="btn btn-secondary btn-icon"
                      disabled={removingId === p.id}
                      onClick={() => removePhoto(p.id)}
                      style={{ position: "absolute", top: -8, right: -8, minHeight: 22, minWidth: 22, fontSize: 12, lineHeight: 1, padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor={`${uid}-photos`}>ADD PHOTOS</label>
            <input id={`${uid}-photos`} aria-label="Photos" ref={fileRef} type="file" name="files" multiple accept="image/*,video/*" onChange={onFilesChosen} />
          </div>
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
              {previews.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Photo ${i + 1} to upload`} style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 8 }} disabled={saving}>
            {saving ? "SAVING…" : "SAVE CHANGES"}
          </button>
        </form>
      </div>
    </div>
  );
}
