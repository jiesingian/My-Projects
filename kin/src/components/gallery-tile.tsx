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
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  id: string;
  url: string | null;
  viewLink?: string | null;
  date: string;
  mediaType: string;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const showImage = url && !broken;
  const clickable = selectMode || showImage;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleActivate() {
    if (selectMode) {
      onToggleSelect?.();
    } else if (showImage) {
      setOpen(true);
    }
  }

  return (
    <>
      <div
        role={clickable ? "button" : undefined}
        aria-pressed={selectMode ? selected : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={handleActivate}
        onKeyDown={(e) => clickable && (e.key === "Enter" || e.key === " ") && handleActivate()}
        className={showImage ? "" : "duotone"}
        style={{
          aspectRatio: "1",
          border: selected ? "2px solid var(--color-accent)" : "1px solid var(--color-divider)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: clickable ? (selectMode ? "pointer" : "zoom-in") : "default",
          background: showImage ? undefined : "repeating-linear-gradient(135deg,var(--color-neutral-300) 0 5px,var(--color-neutral-200) 5px 10px)",
        }}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setBroken(true)} />
        ) : (
          <Icon name={mediaType === "video" ? "images" : "hardDrive"} size={22} className="text-[var(--color-neutral-600)]" />
        )}
        <span style={{ position: "absolute", bottom: 4, left: 4, font: "400 7.5px/1 ui-monospace, Menlo, monospace", background: "var(--color-bg)", padding: "2px 3px", color: "var(--color-neutral-700)" }}>
          {date}
        </span>
        {selectMode ? (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "1.5px solid #fff",
              background: selected ? "var(--color-accent)" : "rgba(0,0,0,.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected && <Icon name="check" size={11} className="text-white" />}
          </span>
        ) : (
          <DeleteButton
            label="Delete photo"
            confirmText="Delete this photo? This can't be undone."
            onDelete={() => deleteJournalMediaAction(id)}
            style={{ position: "absolute", top: 4, right: 4, background: "var(--color-bg)", border: "1px solid var(--color-divider)" }}
          />
        )}
      </div>

      {!selectMode && open && url && (
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
          {viewLink && (
            <a
              href={viewLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ position: "absolute", bottom: 16, right: 20, color: "#fff", fontSize: 11.5, textDecoration: "underline" }}
            >
              Open in Drive
            </a>
          )}
        </div>
      )}
    </>
  );
}
