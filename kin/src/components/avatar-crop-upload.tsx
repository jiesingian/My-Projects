"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileDirect, rollbackUpload, type UploadedFile } from "@/lib/upload-client";
import { addAvatarToAlbumAction } from "@/lib/actions/profile";

/** Draws the image into a square canvas the same way it's previewed on
 * screen — object-fit: cover at scale 1, then uniformly zoomed from
 * center — so the exported photo matches what the zoom slider showed. */
function drawCrop(img: HTMLImageElement, zoom: number, outputSize: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d")!;

  const coverScale = Math.max(outputSize / img.naturalWidth, outputSize / img.naturalHeight);
  const drawWidth = img.naturalWidth * coverScale * zoom;
  const drawHeight = img.naturalHeight * coverScale * zoom;
  const dx = (outputSize - drawWidth) / 2;
  const dy = (outputSize - drawHeight) / 2;
  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))), "image/jpeg", 0.9);
  });
}

export function AvatarCropUpload({ onDone }: { onDone: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const router = useRouter();

  function open() {
    inputRef.current?.click();
  }

  function onFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setObjectUrl(URL.createObjectURL(file));
    setZoom(1);
    setError(null);
  }

  function cancel() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function save() {
    if (!imgRef.current) return;
    setBusy(true);
    setError(null);
    let uploaded: UploadedFile | undefined;
    try {
      const blob = await drawCrop(imgRef.current, zoom, 320);
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
      uploaded = await uploadFileDirect(file, "avatar");

      const result = await addAvatarToAlbumAction(uploaded);
      if (result.error) throw new Error(result.error);

      cancel();
      router.refresh();
      onDone();
    } catch (err) {
      if (uploaded) await rollbackUpload(uploaded);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={open} style={{ all: "unset", cursor: "pointer" }} aria-label="Upload a new photo">
        <span
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--color-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            color: "#fff",
            border: "2px solid var(--color-bg)",
          }}
        >
          +
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />

      {objectUrl && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}
        >
          <div style={{ width: 240, height: 240, borderRadius: "50%", overflow: "hidden", position: "relative", border: "2px solid #fff" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                minWidth: "100%",
                minHeight: "100%",
                transform: `translate(-50%, -50%) scale(${zoom})`,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, width: 240 }}>
            <span style={{ color: "#fff", fontSize: 16 }}>−</span>
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ flex: 1 }} disabled={busy} />
            <span style={{ color: "#fff", fontSize: 16 }}>+</span>
          </div>
          {error && <p style={{ color: "var(--color-accent-400)", fontSize: 13 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 13.5, padding: "0 20px" }} disabled={busy} onClick={cancel}>
              CANCEL
            </button>
            <button type="button" className="btn btn-primary" style={{ minHeight: 40, fontSize: 13.5, padding: "0 20px" }} disabled={busy} onClick={save}>
              {busy ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
