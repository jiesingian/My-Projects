"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { DeleteButton } from "@/components/delete-button";
import { deleteJournalMediaAction } from "@/lib/actions/journal";

export function GalleryTile({
  id,
  url,
  viewLink,
  date,
  mediaType,
}: {
  id: string;
  url: string | null;
  viewLink?: string | null;
  date: string;
  mediaType: string;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const showImage = url && !broken;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const content = (
    <div className={showImage ? "" : "duotone"} style={{ aspectRatio: "1", border: "1px solid var(--color-divider)", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: showImage ? undefined : "repeating-linear-gradient(135deg,var(--color-neutral-300) 0 5px,var(--color-neutral-200) 5px 10px)" }}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setBroken(true)} />
      ) : (
        <Icon name={mediaType === "video" ? "images" : "hardDrive"} size={22} className="text-[var(--color-neutral-600)]" />
      )}
      <span style={{ position: "absolute", bottom: 4, left: 4, font: "400 7.5px/1 ui-monospace, Menlo, monospace", background: "var(--color-bg)", padding: "2px 3px", color: "var(--color-neutral-700)" }}>
        {date}
      </span>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => showImage && setOpen(true)}
        style={{ all: "unset", display: "block", width: "100%", cursor: showImage ? "zoom-in" : "default" }}
      >
        {content}
      </button>

      {open && url && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
          {mediaType === "video" ? (
            <video src={url} controls autoPlay style={{ maxWidth: "100%", maxHeight: "100%" }} onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
          )}
          <div style={{ position: "absolute", bottom: 16, right: 20, display: "flex", alignItems: "center", gap: 14 }}>
            {viewLink && (
              <a
                href={viewLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: "#fff", fontSize: 11.5, textDecoration: "underline" }}
              >
                Open in Drive
              </a>
            )}
            <DeleteButton
              label="Delete photo"
              confirmText="Delete this photo? This can't be undone."
              onDelete={async () => {
                await deleteJournalMediaAction(id);
                setOpen(false);
              }}
              style={{ color: "#fff" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
