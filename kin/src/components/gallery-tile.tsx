"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/photo-viewer";
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
          <img src={url} alt={`Photo from ${date}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setBroken(true)} />
        ) : (
          <Icon name={mediaType === "video" ? "images" : "hardDrive"} size={22} className="text-[var(--color-neutral-600)]" />
        )}
        <span style={{ position: "absolute", bottom: 4, left: 4, font: "400 0.46875rem/1 var(--font-numeric)", background: "var(--color-bg)", padding: "0.125rem 0.1875rem", color: "var(--color-neutral-700)" }}>
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
        <PhotoViewer
          items={[{ url, alt: `Photo from ${date}`, kind: mediaType === "video" ? "video" : "image" }]}
          onClose={() => setOpen(false)}
          label={`Photo from ${date}`}
          footer={
            viewLink
              ? () => (
                  <a href={viewLink} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: "0.8125rem", textDecoration: "underline" }}>
                    Open in Drive
                  </a>
                )
              : undefined
          }
        />
      )}
    </>
  );
}
