"use client";

import { useState } from "react";
import Link from "next/link";
import { PhotoViewer } from "@/components/photo-viewer";

/** The entry card shows photos cropped into a fixed-height strip -- same as
 * an entry's own gallery page. Tapping one opens the full-screen viewer on it,
 * with the entry's other photos a swipe away. */
/** `id` is null for a linked household's photo: it shows, but reactions and
 * comments stay with the household whose photo it is. */
/** With `galleryHref`, a strip holds at most four; past that the fourth
 * becomes "+N" and opens the entry's own gallery, where all of them are. Six
 * photos squeezed into one row were slivers nobody could tell apart. */
export function JournalEntryPhotos({ photos, entryTitle, galleryHref }: { photos: { id: string | null; url: string }[]; entryTitle: string; galleryHref?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;
  const MAX = 4;
  const overflow = galleryHref && photos.length > MAX ? photos.length - (MAX - 1) : 0;
  const shown = overflow ? photos.slice(0, MAX - 1) : photos;

  return (
    <>
      <div style={{ display: "flex", gap: "0.3125rem", marginBottom: "0.5625rem" }}>
        {shown.map(({ id, url }, i) => (
          <button key={id ?? url} type="button" className="kin-photo-thumb" onClick={() => setOpenIndex(i)} aria-label={`Open photo ${i + 1} from ${entryTitle}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: "100%", height: 74, objectFit: "cover", display: "block" }} />
          </button>
        ))}
        {overflow > 0 && galleryHref && (
          <Link href={galleryHref} className="kin-photo-thumb kin-photo-more" aria-label={`See all ${photos.length} photos from ${entryTitle}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[MAX - 1].url} alt="" style={{ width: "100%", height: 74, objectFit: "cover", display: "block" }} />
            <span aria-hidden="true">+{overflow}</span>
          </Link>
        )}
      </div>

      {openIndex !== null && (
        <PhotoViewer
          items={photos.map(({ id, url }, i) => ({ url, alt: `Photo ${i + 1} from ${entryTitle}`, photo: id ? { kind: "journal" as const, id } : undefined }))}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          label={entryTitle}
        />
      )}
    </>
  );
}
