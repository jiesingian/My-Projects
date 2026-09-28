"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhotoSocial } from "@/components/photo-social";
import type { PhotoRef } from "@/lib/actions/photo-social";

export type ViewerItem = {
  url: string;
  alt: string;
  kind?: "image" | "video";
  /** Which stored photo this is, when it is one people can react to and
   * comment on (a journal photo, a profile picture, the household photo). */
  photo?: PhotoRef;
};

/** The one full-screen photo viewer, used everywhere Kin shows a photo large:
 * journal entries, the Gallery, profile and household albums, single photos,
 * and photos in chat.
 *
 * Before this there were five hand-made overlays, and none of them was full
 * screen. Each was drawn inside the page, and the page sits under a frosted
 * panel -- an ancestor with backdrop-filter, which makes position: fixed
 * measure from that panel instead of the screen. So "full screen" meant the
 * content column, with the sidebar still showing, and chat photos opened a
 * new browser tab instead. This draws into document.body through a portal,
 * so it really is the whole screen, the way Facebook and Instagram show a
 * photo.
 *
 * - Swipe left or right (or the arrow keys, or the side arrows on a desktop)
 *   for the next photo; swipe down to close; Escape closes too.
 * - Double-tap or double-click to zoom in on that spot; drag to look around;
 *   double-tap again to come back.
 * - Pinch with two fingers to zoom, up to 4x (28 September: page zoom stays
 *   off everywhere, photos get their own). The photo tracks both fingers 1:1
 *   around the point between them, resists past its limits instead of
 *   stopping dead, and settles back inside them on release. Lift one finger
 *   and the other carries on panning, with no jump.
 * - `footer` renders under the photo for the current index -- the album's
 *   "Use this picture" and Delete, or anything else a caller needs. */
export function PhotoViewer({
  items,
  startIndex = 0,
  onClose,
  footer,
  label = "Photo",
}: {
  items: ViewerItem[];
  startIndex?: number;
  onClose: () => void;
  footer?: (index: number) => React.ReactNode;
  label?: string;
}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1)));
  const [drag, setDrag] = useState<{ x: number; y: number; axis: "x" | "y" | null }>({ x: 0, y: 0, axis: null });
  const [settling, setSettling] = useState(false);
  const [zoom, setZoom] = useState<{ scale: number; ox: number; oy: number; px: number; py: number }>({ scale: 1, ox: 50, oy: 50, px: 0, py: 0 });
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number; t: number; px: number; py: number; backdrop: boolean } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const mediaRef = useRef<HTMLDivElement>(null);
  /** Every finger or pointer down on the stage, for the pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** A pinch in progress: where it started, and the zoom it started from. */
  const pinch = useRef<{ d0: number; m0: { x: number; y: number }; s0: number; t0: { x: number; y: number }; o: { x: number; y: number }; last: { x: number; y: number } } | null>(null);
  const count = items.length;

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setZoom({ scale: 1, ox: 50, oy: 50, px: 0, py: 0 });
      setIndex((i) => (i + delta + count) % count);
    },
    [count],
  );

  // Keyboard, the page behind held still, and focus handed back afterwards.
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      root.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys in the comment box move the cursor, not the photo.
      const typing = (e.target as HTMLElement | null)?.closest?.("input, textarea");
      if (e.key === "Escape") onClose();
      else if (typing) return;
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // The neighbours load while this one is looked at, so a swipe lands on a
  // photo, not on a blank.
  useEffect(() => {
    for (const d of [1, -1]) {
      const n = items[(index + d + count) % count];
      if (count > 1 && n && n.kind !== "video") {
        const img = new Image();
        img.src = n.url;
      }
    }
  }, [index, items, count]);

  if (count === 0 || typeof document === "undefined") return null;
  const item = items[index];
  const zoomed = zoom.scale > 1;

  const MAX_ZOOM = 4;
  /** Past the limits the photo still follows, at a third of the finger's
   * pace -- a soft edge that says "no further" rather than a wall. */
  const soften = (raw: number) => (raw < 1 ? 1 - (1 - raw) / 3 : raw > MAX_ZOOM ? MAX_ZOOM + (raw - MAX_ZOOM) / 3 : raw);

  const pair = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const beginPinch = () => {
    const el = mediaRef.current;
    const stage = el?.parentElement;
    if (!el || !stage) return;
    const { d, m } = pair();
    if (d < 1) return;
    const r = stage.getBoundingClientRect();
    // Zooming out of the resting photo: anchor its origin under the fingers,
    // so the spot being pinched is the spot that grows. Already zoomed: keep
    // the origin and let the translation do the work.
    let z = zoom;
    if (!zoomed) {
      z = { scale: 1, ox: ((m.x - r.left - el.offsetLeft) / el.offsetWidth) * 100, oy: ((m.y - r.top - el.offsetTop) / el.offsetHeight) * 100, px: 0, py: 0 };
      setZoom(z);
    }
    pinch.current = {
      d0: d,
      m0: m,
      s0: z.scale,
      t0: { x: z.px, y: z.py },
      o: { x: r.left + el.offsetLeft + (z.ox / 100) * el.offsetWidth, y: r.top + el.offsetTop + (z.oy / 100) * el.offsetHeight },
      last: { x: z.px, y: z.py },
    };
    start.current = null;
    lastTap.current = null;
    window.clearTimeout(closeTimer.current);
    setSettling(false);
    setDrag({ x: 0, y: 0, axis: null });
  };

  const movePinch = () => {
    const p = pinch.current;
    if (!p || pointers.current.size < 2) return;
    const { d, m } = pair();
    const scale = soften((p.s0 * d) / p.d0);
    // Keep the point that was under the fingers under the fingers: it sits at
    // o + t + s(q - o) on screen, and was at m0 when the pinch began.
    const k = scale / p.s0;
    p.last = { x: m.x - p.o.x - k * (p.m0.x - p.o.x - p.t0.x), y: m.y - p.o.y - k * (p.m0.y - p.o.y - p.t0.y) };
    const { x: px, y: py } = p.last;
    setZoom((z) => ({ ...z, scale, px, py }));
  };

  const endPinch = () => {
    const last = pinch.current?.last ?? { x: zoom.px, y: zoom.py };
    pinch.current = null;
    setSettling(true);
    setZoom((z) => {
      if (z.scale <= 1.05) return { scale: 1, ox: 50, oy: 50, px: 0, py: 0 };
      return z.scale > MAX_ZOOM ? { ...z, scale: MAX_ZOOM } : z;
    });
    // One finger still down carries on as a pan from where it is now.
    const rest = [...pointers.current.values()][0];
    if (rest) start.current = { x: rest.x, y: rest.y, t: performance.now(), px: last.x, py: last.y, backdrop: false };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // The arrows and a video's own controls take their own presses; capturing
    // the pointer here would swallow them.
    if ((e.target as HTMLElement).closest("button, video")) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (pointers.current.size === 2 && item.kind !== "video") {
      beginPinch();
      return;
    }
    if (pointers.current.size > 2 || pinch.current) return;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
      px: zoom.px,
      py: zoom.py,
      // Only a mouse click on the black closes. On a phone the black is the
      // strips above and below the photo, and a thumb resting there should
      // not throw the picture away.
      backdrop: e.pointerType === "mouse" && e.target === e.currentTarget,
    };
    setSettling(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current) {
      movePinch();
      return;
    }
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (zoomed) {
      setZoom((z) => ({ ...z, px: s.px + dx, py: s.py + dy }));
      return;
    }
    setDrag((d) => {
      const axis = d.axis ?? (Math.abs(dx) > 8 || Math.abs(dy) > 8 ? (Math.abs(dx) > Math.abs(dy) ? "x" : "y") : null);
      if (axis === "x") return { x: count > 1 ? dx : dx / 4, y: 0, axis };
      if (axis === "y") return { x: 0, y: Math.max(0, dy), axis };
      return d;
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      // The end of a pinch is never a tap or a swipe.
      if (pointers.current.size < 2) endPinch();
      return;
    }
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = Math.max(1, performance.now() - s.t);
    const moved = Math.hypot(dx, dy) > 10;

    if (!moved) {
      // A tap. Two within 300ms is a double-tap: zoom in on that spot, or
      // come back out.
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null;
        window.clearTimeout(closeTimer.current);
        if (zoomed) setZoom({ scale: 1, ox: 50, oy: 50, px: 0, py: 0 });
        else {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setZoom({ scale: 2.5, ox: ((e.clientX - r.left) / r.width) * 100, oy: ((e.clientY - r.top) / r.height) * 100, px: 0, py: 0 });
        }
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
        // A click on the black closes -- but not until it is clear this was
        // not the first half of a double-click, which zooms instead.
        if (s.backdrop && !zoomed) closeTimer.current = window.setTimeout(onClose, 300);
      }
      setDrag({ x: 0, y: 0, axis: null });
      return;
    }

    if (zoomed) return;
    setSettling(true);
    if (drag.axis === "x" && (Math.abs(dx) > 60 || Math.abs(dx) / dt > 0.5)) go(dx < 0 ? 1 : -1);
    else if (drag.axis === "y" && (dy > 110 || dy / dt > 0.6)) {
      onClose();
      return;
    }
    setDrag({ x: 0, y: 0, axis: null });
  };

  // Pulling down fades the black away, so the page shows through as the
  // photo is dismissed -- the same cue Instagram gives.
  const fade = drag.axis === "y" ? Math.max(0.35, 1 - drag.y / 500) : 1;

  return createPortal(
    <div className="kin-viewer" role="dialog" aria-modal="true" aria-label={label} style={{ ["--kin-viewer-fade" as string]: fade }}>
      <div className="kin-viewer-bar">
        <span className="kin-viewer-count" aria-live="polite">
          {count > 1 ? `${index + 1} / ${count}` : ""}
        </span>
        <button ref={closeRef} type="button" className="kin-viewer-close" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="kin-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (pinch.current) {
            if (pointers.current.size < 2) endPinch();
            return;
          }
          start.current = null;
          setDrag({ x: 0, y: 0, axis: null });
        }}
      >
        <div
          ref={mediaRef}
          className="kin-viewer-media"
          data-settling={settling ? "true" : undefined}
          style={{
            transform: zoomed
              ? `translate(${zoom.px}px, ${zoom.py}px) scale(${zoom.scale})`
              : `translate(${drag.x}px, ${drag.y}px) scale(${drag.axis === "y" ? Math.max(0.8, 1 - drag.y / 1200) : 1})`,
            transformOrigin: `${zoom.ox}% ${zoom.oy}%`,
          }}
        >
          {item.kind === "video" ? (
            <video key={item.url} src={item.url} controls autoPlay playsInline aria-label={item.alt} />
          ) : (
            // Signed, short-lived storage URLs: the image optimiser would
            // cache them past their own expiry.
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.url} src={item.url} alt={item.alt} draggable={false} />
          )}
        </div>

        {count > 1 && (
          <>
            <button type="button" className="kin-viewer-arrow" data-side="prev" aria-label="Previous photo" onClick={() => go(-1)}>
              ‹
            </button>
            <button type="button" className="kin-viewer-arrow" data-side="next" aria-label="Next photo" onClick={() => go(1)}>
              ›
            </button>
          </>
        )}
      </div>

      {(footer || item.photo) && (
        <div className="kin-viewer-footer">
          {item.photo && <PhotoSocial key={`${item.photo.kind}:${item.photo.id}`} photo={item.photo} />}
          {footer?.(index)}
        </div>
      )}
    </div>,
    document.body,
  );
}
