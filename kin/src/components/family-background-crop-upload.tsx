"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addFamilyBackgroundAction } from "@/lib/actions/family";

const STAGE_W = 320;
const STAGE_H = 320;
const FRAME_W = 280;
const FRAME_H = 210; // 4:3 — matches a standard cellphone camera photo
const FRAME_LEFT = (STAGE_W - FRAME_W) / 2;
const FRAME_TOP = (STAGE_H - FRAME_H) / 2;
const OUTPUT_W = 1200;
const OUTPUT_H = 900;

/** Clamped against the crop FRAME, not the stage — panning only needs to
 * keep the frame covered by the image; the stage is just extra room around
 * it so the cropped-away parts stay visible (ghosted). Clamping against the
 * stage instead would lock panning any time the image's rendered size fell
 * between the frame and stage size, which is the common case. */
function clampAxis(pan: number, rendered: number, frame: number) {
  if (rendered <= frame) return 0;
  const maxOffset = (rendered - frame) / 2;
  return Math.max(-maxOffset, Math.min(maxOffset, pan));
}

/** Crops by drawing the frame rectangle (in stage coordinates) back onto the
 * source image at its natural resolution, using the same math that
 * positions the on-screen preview. */
function drawCrop(img: HTMLImageElement, scale: number, panX: number, panY: number): Promise<Blob> {
  const renderedW = img.naturalWidth * scale;
  const renderedH = img.naturalHeight * scale;
  const imgLeft = STAGE_W / 2 - renderedW / 2 + panX;
  const imgTop = STAGE_H / 2 - renderedH / 2 + panY;

  const sx = (FRAME_LEFT - imgLeft) / scale;
  const sy = (FRAME_TOP - imgTop) / scale;
  const sw = FRAME_W / scale;
  const sh = FRAME_H / scale;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_W, OUTPUT_H);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.9);
  });
}

export function FamilyBackgroundCropUpload({ familyId, onDone }: { familyId: string; onDone: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const router = useRouter();

  const baseScale = naturalSize.w > 0 ? Math.min(STAGE_W / naturalSize.w, STAGE_H / naturalSize.h) : 1;
  const scale = baseScale * zoom;
  const renderedW = naturalSize.w * scale;
  const renderedH = naturalSize.h * scale;

  function open() {
    inputRef.current?.click();
  }

  function onFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setObjectUrl(URL.createObjectURL(file));
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(null);
  }

  function onImgLoad() {
    if (!imgRef.current) return;
    setNaturalSize({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
  }

  function cancel() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({
      x: clampAxis(dragRef.current.panX + dx, renderedW, FRAME_W),
      y: clampAxis(dragRef.current.panY + dy, renderedH, FRAME_H),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onZoomChange(next: number) {
    setZoom(next);
    setPan((p) => ({
      x: clampAxis(p.x, naturalSize.w * baseScale * next, FRAME_W),
      y: clampAxis(p.y, naturalSize.h * baseScale * next, FRAME_H),
    }));
  }

  async function save() {
    if (!imgRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await drawCrop(imgRef.current, scale, pan.x, pan.y);
      const path = `${familyId}/household-bg-${Date.now()}.jpg`;
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (uploadErr) throw new Error(uploadErr.message);

      const result = await addFamilyBackgroundAction(path);
      if (result.error) throw new Error(result.error);

      cancel();
      router.refresh();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: 32, fontSize: 11, padding: "0 12px", marginTop: 8 }} onClick={open}>
        ADD PHOTO
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

      {objectUrl && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}
        >
          <p style={{ color: "#fff", fontSize: 11.5, margin: 0 }}>Drag to reposition · the dimmed area won&apos;t be included</p>
          <div style={{ position: "relative", width: STAGE_W, height: STAGE_H, overflow: "hidden", touchAction: "none", cursor: "grab" }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              onLoad={onImgLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: STAGE_W / 2 - renderedW / 2 + pan.x,
                top: STAGE_H / 2 - renderedH / 2 + pan.y,
                width: renderedW,
                height: renderedH,
                userSelect: "none",
              }}
            />
            {/* Ghosting mask: everything outside the frame is dimmed via a
                huge box-shadow clipped by the stage's overflow:hidden. */}
            <div
              style={{
                position: "absolute",
                left: FRAME_LEFT,
                top: FRAME_TOP,
                width: FRAME_W,
                height: FRAME_H,
                boxShadow: "0 0 0 9999px rgba(0,0,0,.6)",
                border: "1.5px solid #fff",
                pointerEvents: "none",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: STAGE_W }}>
            <span style={{ color: "#fff", fontSize: 16 }}>−</span>
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => onZoomChange(Number(e.target.value))} style={{ flex: 1 }} disabled={busy} />
            <span style={{ color: "#fff", fontSize: 16 }}>+</span>
          </div>
          {error && <p style={{ color: "var(--color-accent-400)", fontSize: 11.5 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 12, padding: "0 20px" }} disabled={busy} onClick={cancel}>
              CANCEL
            </button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 40, fontSize: 12, padding: "0 20px" }} disabled={busy} onClick={save}>
              {busy ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
