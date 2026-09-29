"use client";

import { useEffect, useRef, useState } from "react";
import { STICKERS, gifBody, stickerBody, type ChatMedia, type GifResult, type Sticker } from "@/lib/chat-media";
import { searchGifsAction } from "@/lib/actions/gifs";

/** A sticker as it sits in the thread, or as a choice in the picker. */
export function StickerArt({ sticker, size = "md" }: { sticker: Sticker; size?: "sm" | "md" }) {
  return (
    <span className="kin-sticker" data-size={size} style={{ background: `linear-gradient(135deg, ${sticker.from}, ${sticker.to})` }}>
      <span className="kin-sticker-emoji" aria-hidden="true">
        {sticker.emoji}
      </span>
      <span className="kin-sticker-caption">{sticker.caption}</span>
    </span>
  );
}

/** A sticker or GIF message, drawn without a bubble around it. */
export function ChatMediaView({ media }: { media: ChatMedia }) {
  if (media.kind === "sticker") return <StickerArt sticker={media.sticker} />;
  const { url, width, height } = media.gif;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- GIPHY serves its own sized renditions; Next's optimiser would re-encode an animation into a still.
    <img className="kin-gif" src={url} width={width} height={height} alt="GIF" loading="lazy" decoding="async" style={{ aspectRatio: `${width} / ${height}` }} />
  );
}

/** Stickers and GIFs, above the composer. GIFs need GIPHY's key; until it is
 * set that tab says so rather than hiding, so nobody wonders where it went. */
export function MediaPicker({ gifReady, onSend, onClose }: { gifReady: boolean; onSend: (body: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"stickers" | "gifs">("stickers");
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<GifResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    if (tab !== "gifs" || !gifReady) return;
    const n = ++asked.current;
    const t = window.setTimeout(async () => {
      const r = await searchGifsAction(q);
      if (n !== asked.current) return; // a newer search has been typed
      setGifs(r.results);
      setError(r.error);
    }, q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [tab, q, gifReady]);

  return (
    <div className="kin-media-picker" role="dialog" aria-label="Stickers and GIFs">
      <div className="kin-media-tabs">
        <button type="button" className="chip" aria-pressed={tab === "stickers"} onClick={() => setTab("stickers")}>
          Stickers
        </button>
        <button type="button" className="chip" aria-pressed={tab === "gifs"} onClick={() => setTab("gifs")}>
          GIFs
        </button>
        <button type="button" className="btn btn-ghost kin-media-close" onClick={onClose}>
          Done
        </button>
      </div>
      {tab === "stickers" ? (
        <div className="kin-media-grid" data-kind="stickers">
          {STICKERS.map((s) => (
            <button key={s.id} type="button" className="kin-media-pick" aria-label={`Send sticker: ${s.caption}`} onClick={() => onSend(stickerBody(s.id))}>
              <StickerArt sticker={s} size="sm" />
            </button>
          ))}
        </div>
      ) : !gifReady ? (
        <p className="kin-media-note">GIF search is coming soon. It switches on once Jonathan adds the GIPHY key. Stickers work now.</p>
      ) : (
        <>
          <input className="input kin-media-search" type="search" placeholder="Search GIFs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search GIFs" enterKeyHint="search" />
          {error && <p className="kin-media-note">{error}</p>}
          <div className="kin-media-grid" data-kind="gifs">
            {gifs === null && !error && <p className="kin-media-note">Loading…</p>}
            {gifs?.length === 0 && !error && <p className="kin-media-note">No GIFs for that. Try another word.</p>}
            {gifs?.map((g) => (
              <button key={g.id} type="button" className="kin-media-pick" aria-label={`Send GIF: ${g.title}`} onClick={() => onSend(gifBody(g.send))}>
                {/* eslint-disable-next-line @next/next/no-img-element -- as above: animated, and already sized by GIPHY. */}
                <img src={g.preview.url} alt="" loading="lazy" style={{ aspectRatio: `${g.preview.width} / ${g.preview.height}` }} />
              </button>
            ))}
          </div>
          <p className="kin-media-credit">Powered by GIPHY</p>
        </>
      )}
    </div>
  );
}
