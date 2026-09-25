"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/photo-viewer";

/** The entry card shows photos cropped into a fixed-height strip -- same as
 * the Gallery grid's tiles. Tapping one opens the full-screen viewer on it,
 * with the entry's other photos a swipe away. */
export function JournalEntryPhotos({ urls, entryTitle }: { urls: string[]; entryTitle: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <div style={{ display: "flex", gap: "0.3125rem", marginBottom: "0.5625rem" }}>
        {urls.map((url, i) => (
          <button key={i} type="button" className="kin-photo-thumb" onClick={() => setOpenIndex(i)} aria-label={`Open photo ${i + 1} from ${entryTitle}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" style={{ width: "100%", height: 74, objectFit: "cover", display: "block" }} />
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <PhotoViewer
          items={urls.map((url, i) => ({ url, alt: `Photo ${i + 1} from ${entryTitle}` }))}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          label={entryTitle}
        />
      )}
    </>
  );
}
