"use client";

import { useRef } from "react";
import { BACKGROUNDS, FACES, FILTERS, type BackgroundId, type FaceId, type FilterId } from "@/lib/call-effects";

/** The row of effects under a video call (28 September): colour filters and
 * backgrounds, like Messenger's. The chosen photo for "Your photo" stays on
 * this phone -- it is drawn into the picture, never uploaded. */
export function CallEffectsTray({
  filter,
  background,
  face,
  loading,
  onChange,
  onFace,
  onClose,
}: {
  filter: FilterId;
  background: BackgroundId;
  face: FaceId;
  loading: boolean;
  onChange: (filter: FilterId, background: BackgroundId, photo?: HTMLImageElement | null) => void;
  onFace: (face: FaceId) => void;
  onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);

  const pickPhoto = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    const img = new Image();
    img.onload = () => onChange(filter, "photo", img);
    img.src = URL.createObjectURL(f);
    if (file.current) file.current.value = "";
  };

  return (
    <div className="kin-fx" role="group" aria-label="Video effects">
      <div className="kin-fx-head">
        <span>Effects</span>
        {loading && <span className="kin-fx-loading">Getting it ready…</span>}
        <button type="button" className="kin-fx-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div className="kin-fx-label">Face</div>
      <div className="kin-fx-row">
        {FACES.map((f) => (
          <button key={f.id} type="button" className="kin-fx-chip" aria-pressed={face === f.id} disabled={loading} onClick={() => onFace(f.id)}>
            <span className="kin-fx-swatch kin-fx-glyph" data-face={f.id} aria-hidden="true">
              {f.glyph}
            </span>
            {f.label}
          </button>
        ))}
      </div>
      <div className="kin-fx-label">Filter</div>
      <div className="kin-fx-row">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="kin-fx-chip" data-fx={f.id} aria-pressed={filter === f.id} onClick={() => onChange(f.id, background)}>
            <span className="kin-fx-swatch" data-filter={f.id} aria-hidden="true" />
            {f.label}
          </button>
        ))}
      </div>
      <div className="kin-fx-label">Background</div>
      <div className="kin-fx-row">
        {BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            className="kin-fx-chip"
            aria-pressed={background === b.id}
            disabled={loading}
            onClick={() => (b.id === "photo" ? file.current?.click() : onChange(filter, b.id))}
          >
            <span className="kin-fx-swatch" data-bg={b.id} aria-hidden="true" />
            {b.label}
          </button>
        ))}
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
    </div>
  );
}
