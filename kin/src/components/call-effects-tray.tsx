"use client";

import { useRef } from "react";
import { BACKGROUNDS, FACES, FILTERS, HAIR_COLOURS, HAIR_STYLES, type BackgroundId, type FaceId, type FilterId, type HairColourId, type HairStyleId } from "@/lib/call-effects";

/** The row of effects under a video call (28 September): colour filters and
 * backgrounds, like Messenger's; hairstyles and hair colours since 29 September. The chosen photo for "Your photo" stays on
 * this phone -- it is drawn into the picture, never uploaded. */
export function CallEffectsTray({
  filter,
  background,
  face,
  hair,
  loading,
  onChange,
  onFace,
  onHair,
  onClose,
}: {
  filter: FilterId;
  background: BackgroundId;
  face: FaceId;
  hair: { style: HairStyleId; colour: HairColourId };
  loading: boolean;
  onChange: (filter: FilterId, background: BackgroundId, photo?: HTMLImageElement | null) => void;
  onFace: (face: FaceId) => void;
  onHair: (style: HairStyleId, colour: HairColourId) => void;
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
      <div className="kin-fx-label">Hair</div>
      <div className="kin-fx-row">
        {HAIR_STYLES.map((h) => (
          <button key={h.id} type="button" className="kin-fx-chip" aria-pressed={hair.style === h.id} disabled={loading} onClick={() => onHair(h.id, hair.colour)}>
            <span className="kin-fx-swatch" data-hair={h.id} aria-hidden="true" />
            {h.label}
          </button>
        ))}
      </div>
      <div className="kin-fx-label">Hair colour</div>
      <div className="kin-fx-row">
        {HAIR_COLOURS.map((c) => (
          <button key={c.id} type="button" className="kin-fx-chip" aria-pressed={hair.colour === c.id} disabled={loading} onClick={() => onHair(hair.style, c.id)}>
            <span
              className="kin-fx-swatch"
              data-hair-colour={c.id}
              style={c.id === "none" ? undefined : { background: `rgb(${c.rgb.join(",")})` }}
              aria-hidden="true"
            />
            {c.label}
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
