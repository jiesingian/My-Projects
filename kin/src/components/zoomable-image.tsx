"use client";

import { useState } from "react";
import { PhotoViewer } from "@/components/photo-viewer";

/** A single content photo that opens full screen when tapped -- for the spots
 * that show one photo at a time and aren't already part of an album. The
 * viewer itself is the shared one (photo-viewer.tsx). */
export function ZoomableImage({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} onClick={() => setOpen(true)} style={{ cursor: "zoom-in", ...style }} />
      {open && <PhotoViewer items={[{ url: src, alt }]} onClose={() => setOpen(false)} label={alt} />}
    </>
  );
}
