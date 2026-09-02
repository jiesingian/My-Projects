"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function GalleryTile({
  url,
  viewLink,
  date,
  mediaType,
}: {
  url: string | null;
  viewLink?: string | null;
  date: string;
  mediaType: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = url && !broken;

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

  if (viewLink) {
    return (
      <a href={viewLink} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
        {content}
      </a>
    );
  }
  return content;
}
