"use client";

import { useEffect, useState } from "react";

/** The entry card shows photos cropped into a fixed-height strip — same as
 * the Gallery grid's tiles. Gallery already solves "let me see the whole
 * thing" with a click-through, full-size viewer; entries never got it, so a
 * cropped photo here had no way to be seen in full. */
export function JournalEntryPhotos({ urls }: { urls: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenIndex(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex]);

  if (urls.length === 0) return null;

  return (
    <>
      <div style={{ display: "flex", gap: 5, marginBottom: 9 }}>
        {urls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            onClick={() => setOpenIndex(i)}
            style={{ flex: 1, height: 74, objectFit: "cover", border: "1px solid var(--color-divider)", cursor: "zoom-in" }}
          />
        ))}
      </div>

      {openIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenIndex(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpenIndex(null)}
            style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[openIndex]} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
