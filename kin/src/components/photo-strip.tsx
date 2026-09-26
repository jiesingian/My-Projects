"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { confirm } from "@/components/confirm-sheet";
import { PhotoViewer } from "@/components/photo-viewer";

/** A row of photos with an "Add photo" tile: a doctor's visit, a calendar
 * event. The file goes from the phone straight to Storage under `folder`
 * (always <family id>/...), which the journal bucket's policies confine to
 * the household; `onAdd` then records it, and a failed record removes the
 * file again so nothing is left orphaned. */
export function PhotoStrip({
  folder,
  photos,
  label,
  onAdd,
  onDelete,
}: {
  folder: string;
  photos: { id: string; url: string }[];
  label: string;
  onAdd: (path: string) => Promise<{ error: string | null }>;
  onDelete: (id: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    let added = 0;
    for (const file of Array.from(files).slice(0, 10)) {
      if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name} isn't a photo under 15MB.`);
        continue;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("journal").upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error(`${file.name} didn't upload. ${error.message}`);
        continue;
      }
      const saved = await onAdd(path);
      if (saved.error) {
        toast.error(saved.error);
        await supabase.storage.from("journal").remove([path]);
        continue;
      }
      added++;
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (added) {
      toast.success(added === 1 ? "Photo added" : `${added} photos added`);
      router.refresh();
    }
  };

  return (
    <div>
      <div className="kin-care-photos">
        {photos.map((p, i) => (
          <div key={p.id} className="kin-care-photo">
            <button type="button" onClick={() => setOpen(i)} aria-label={`Open ${label.toLowerCase()} ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not a static asset */}
              <img src={p.url} alt={`${label} ${i + 1}`} />
            </button>
            <button
              type="button"
              className="kin-care-photo-del"
              aria-label={`Delete ${label.toLowerCase()} ${i + 1}`}
              disabled={pending}
              onClick={async () => {
                if (!(await confirm({ title: "Delete this photo?", confirmLabel: "Delete", danger: true }))) return;
                start(async () => {
                  const { error } = await onDelete(p.id);
                  if (error) toast.error(error);
                  else router.refresh();
                });
              }}
            >
              <Icon name="x" size="0.875rem" />
            </button>
          </div>
        ))}
        <button type="button" className="kin-care-photo kin-care-photo-add" onClick={() => input.current?.click()} disabled={busy}>
          <Icon name="camera" size="1.375rem" />
          <span>{busy ? "Uploading…" : "Add photo"}</span>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
      {open !== null && <PhotoViewer items={photos.map((p, i) => ({ url: p.url, alt: `${label} ${i + 1}` }))} startIndex={open} onClose={() => setOpen(null)} label={label} />}
    </div>
  );
}
