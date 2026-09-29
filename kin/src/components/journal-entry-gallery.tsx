"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/photo-viewer";

/** Every photo of one entry, as a grid -- the entry's own gallery, on its own
 * page (29 September, Janine: "gallery view of a journal should be viewed upon
 * clicking that particular journal"). The card in the list shows a strip of a
 * few; this shows them all, and tapping one opens the same full-screen viewer
 * with the rest a swipe away. */
export function JournalEntryGallery({ photos, entryTitle }: { photos: { id: string | null; url: string }[]; entryTitle: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="kin-gallerygrid">
        {photos.map(({ id, url }, i) => (
          <button
            key={id ?? url}
            type="button"
            className="kin-photo-thumb"
            style={{ aspectRatio: "1" }}
            onClick={() => setOpenIndex(i)}
            aria-label={`Open photo ${i + 1} of ${photos.length} from ${entryTitle}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" loading={i > 8 ? "lazy" : undefined} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </button>
        ))}
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
