"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createJournalEntryAction, attachJournalMediaAction } from "@/lib/actions/journal";
import { uploadFileDirect, rollbackUpload, type UploadedFile } from "@/lib/upload-client";
import { ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";
import { familyDay } from "@/lib/time";
import { DateInput } from "@/components/date-input";

export function NewEntryForm({ members, defaultTitle }: { members: Tables<"members">[]; defaultTitle?: string }) {
  const uid = useId();
  const [people, setPeople] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFilesChosen() {
    previews.forEach((url) => URL.revokeObjectURL(url));
    const files = Array.from(fileRef.current?.files ?? []);
    setPreviews(files.filter((f) => f.type.startsWith("image")).map((f) => URL.createObjectURL(f)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "");
    const date = String(fd.get("date") ?? familyDay());
    const note = String(fd.get("note") ?? "").trim() || null;

    const created = await createJournalEntryAction({ title, date, note, people });
    if (created.error || !created.entryId) {
      setError(created.error ?? "Something went wrong.");
      setSaving(false);
      return;
    }

    const files = Array.from(fileRef.current?.files ?? []).filter((f) => f.size > 0);
    for (let i = 0; i < files.length; i++) {
      let uploaded: UploadedFile | undefined;
      try {
        uploaded = await uploadFileDirect(files[i], "journal");
        const mediaType = files[i].type.startsWith("video") ? "video" : "photo";
        const result = await attachJournalMediaAction({ entryId: created.entryId, mediaType, takenAt: date, sortOrder: i, uploaded });
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
      <DetailHeader backHref="/journal?view=list" eyebrow="Journal" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "1.875rem", margin: "0 0 16px" }}>Add a journal entry</h3>
        <form onSubmit={onSubmit}>
          <ErrorText message={error} />
          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-title`}>Title</label>
            <input id={`${uid}-title`} aria-label="Title" className="input" name="title" required defaultValue={defaultTitle} style={{ minHeight: "2.75rem" }} />
          </div>
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label htmlFor={`${uid}-date`}>Date</label>
            <DateInput id={`${uid}-date`} aria-label="Date" className="input" name="date" defaultValue={familyDay()} required style={{ minHeight: "2.75rem" }} />
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Who was there</div>
          <div style={{ display: "flex", gap: "0.4375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
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
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label htmlFor={`${uid}-note`}>Note</label>
            <textarea id={`${uid}-note`} aria-label="Note" className="input" name="note" placeholder="What happened?" />
          </div>
          <div className="field" style={{ marginBottom: "0.625rem" }}>
            <label htmlFor={`${uid}-photos`}>Photos</label>
            <input id={`${uid}-photos`} aria-label="Photos" ref={fileRef} type="file" name="files" multiple accept="image/*,video/*" onChange={onFilesChosen} />
          </div>
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: "0.3125rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              {previews.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Photo ${i + 1} to upload`} style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "0.5rem" }} disabled={saving}>
            {saving ? "Saving…" : "Save entry"}
          </button>
        </form>
      </div>
    </div>
  );
}
