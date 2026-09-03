"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileDirect } from "@/lib/upload-client";
import { attachJournalMediaAction } from "@/lib/actions/journal";
import { ErrorText } from "@/components/form";

export function GalleryUpload() {
  const [previews, setPreviews] = useState<{ url: string; isVideo: boolean }[]>([]);
  const [status, setStatus] = useState<{ uploading: boolean; done: number; total: number; error: string | null }>({
    uploading: false,
    done: 0,
    total: 0,
    error: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function onFilesChosen() {
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    const files = Array.from(inputRef.current?.files ?? []);
    setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), isVideo: f.type.startsWith("video") })));
  }

  async function onUpload() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;

    setStatus({ uploading: true, done: 0, total: files.length, error: null });
    const today = new Date().toISOString().slice(0, 10);
    for (const file of files) {
      try {
        const uploaded = await uploadFileDirect(file, "journal");
        const mediaType = file.type.startsWith("video") ? "video" : "photo";
        const result = await attachJournalMediaAction({ mediaType, takenAt: today, uploaded });
        if (result.error) throw new Error(result.error);
        setStatus((s) => ({ ...s, done: s.done + 1 }));
      } catch (err) {
        setStatus((s) => ({ ...s, uploading: false, error: (err as Error).message }));
        return;
      }
    }

    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews([]);
    if (inputRef.current) inputRef.current.value = "";
    setStatus({ uploading: false, done: 0, total: 0, error: null });
    router.refresh();
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input ref={inputRef} type="file" name="files" multiple accept="image/*,video/*" style={{ flex: 1, fontSize: 12 }} onChange={onFilesChosen} disabled={status.uploading} />
        <button type="button" className="btn btn-primary" style={{ minHeight: 40, fontSize: 12 }} onClick={onUpload} disabled={status.uploading || previews.length === 0}>
          {status.uploading ? `UPLOADING ${status.done + 1}/${status.total}…` : "UPLOAD"}
        </button>
      </div>
      <ErrorText message={status.error} />
      {previews.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {previews.map((p, i) =>
            p.isVideo ? (
              <video key={i} src={p.url} muted style={{ width: 52, height: 52, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt="" style={{ width: 52, height: 52, objectFit: "cover", border: "1px solid var(--color-divider)" }} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
