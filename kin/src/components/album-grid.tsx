"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PhotoViewer } from "@/components/photo-viewer";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";
import { deleteAlbumAction, removeFromAlbumAction } from "@/lib/actions/chat-albums";

/** An album's photos as a grid; a tap opens the full-screen viewer. Taking a
 * photo out of the album leaves it in the chat. */
export function AlbumGrid({ albumId, photos, canDelete }: { albumId: string; photos: { id: string; url: string; canRemove: boolean }[]; canDelete: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const remove = async (id: string) => {
    if (!(await confirm({ title: "Take this photo out of the album?", description: "It stays in the family chat.", confirmLabel: "Take out" }))) return;
    start(async () => {
      const r = await removeFromAlbumAction(albumId, id);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  };

  const removeAlbum = async () => {
    if (!(await confirm({ title: "Delete this album?", description: "The photos stay in the family chat.", confirmLabel: "Delete", danger: true }))) return;
    start(async () => {
      const r = await deleteAlbumAction(albumId);
      if (r.error) toast.error(r.error);
      else router.push("/chat/albums");
    });
  };

  return (
    <>
      {photos.length === 0 ? (
        <p className="kin-albums-empty">No photos in this album yet.</p>
      ) : (
        <ul className="kin-album-grid">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="kin-album-open" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not a static asset */}
                <img src={p.url} alt={`Photo ${i + 1}`} loading="lazy" />
              </button>
              {p.canRemove && (
                <button type="button" className="kin-album-remove" disabled={pending} onClick={() => void remove(p.id)} aria-label={`Take photo ${i + 1} out of the album`}>
                  <Icon name="x" size="0.8125rem" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canDelete && (
        <button type="button" className="btn btn-ghost kin-album-delete" disabled={pending} onClick={() => void removeAlbum()}>
          Delete album
        </button>
      )}
      {open !== null && <PhotoViewer items={photos.map((p, i) => ({ url: p.url, alt: `Photo ${i + 1}` }))} startIndex={open} onClose={() => setOpen(null)} label="Album photo" />}
    </>
  );
}
