"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createJournalEntryAction, attachJournalMediaAction } from "@/lib/actions/journal";
import { uploadFileDirect } from "@/lib/upload-client";
import { ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

export function NewEntryForm({ members }: { members: Tables<"members">[] }) {
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
    const date = String(fd.get("date") ?? new Date().toISOString().slice(0, 10));
    const note = String(fd.get("note") ?? "").trim() || null;

    const created = await createJournalEntryAction({ title, date, note, people });
    if (created.error || !created.entryId) {
      setError(created.error ?? "Something went wrong.");
      setSaving(false);
      return;
    }

    const files = Array.from(fileRef.current?.files ?? []).filter((f) => f.size > 0);
    for (let i = 0; i < files.length; i++) {
      try {
        const uploaded = await uploadFileDirect(files[i], "journal");
        const mediaType = files[i].type.startsWith("video") ? "video" : "photo";
        const result = await attachJournalMediaAction({ entryId: created.entryId, mediaType, takenAt: date, sortOrder: i, uploaded });
        if (result.error) throw new Error(result.error);
      } catch (err) {
        setError(`Entry saved, but ${(err as Error).message}`);
        setSaving(false);
        return;
      }
    }

    router.push("/journal?seg=entries");
    router.refresh();
  }

  return (
    <div>
      <DetailHeader backHref="/journal?seg=entries" eyebrow="HUB 02 · NEW ENTRY" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a journal entry</h3>
        <form onSubmit={onSubmit}>
          <ErrorText message={error} />
          <div className="field" style={{ marginBottom: 14 }}>
            <label>TITLE</label>
            <input className="input" name="title" required style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>DATE</label>
            <input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} required style={{ minHeight: 44 }} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", marginBottom: 6 }}>Who was there</div>
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
            <label>NOTE</label>
            <textarea className="input" name="note" placeholder="What happened?" />
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label>PHOTOS</label>
            <input ref={fileRef} type="file" name="files" multiple accept="image/*,video/*" onChange={onFilesChosen} />
          </div>
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
              {previews.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
              ))}
            </div>
          )}
          <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 8 }} disabled={saving}>
            {saving ? "SAVING…" : "SAVE ENTRY"}
          </button>
        </form>
      </div>
    </div>
  );
}
