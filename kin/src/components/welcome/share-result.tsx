"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Answers } from "@/lib/check-up";
import { SHARE_FILE_NAME, SHARE_SIZE, shareCard, shareText, type ShareCard, type ShareChoice } from "@/lib/check-up-share";
import { wrapText } from "@/lib/year-book";
import { shareOrDownload } from "@/lib/share-file";

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const INK = "#1c1c1e";
const SOFT = "#5f5f66";
const noSubscribe = () => () => {};

/** The page's own accent colours, so the card looks like the page it came
 * from (the palette the check-up is shown in). */
function accents(): { accent: string; accent2: string } {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { accent: read("--color-accent", "#007aff"), accent2: read("--color-accent-2", "#5ac8fa") };
}

/** The card, drawn on a 1080 by 1350 canvas: always light, like a printed
 * card, whatever the phone's theme. */
function draw(ctx: CanvasRenderingContext2D, card: ShareCard) {
  const { w, h } = SHARE_SIZE;
  const m = 96;
  const { accent: ACCENT, accent2 } = accents();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  wash.addColorStop(0, ACCENT);
  wash.addColorStop(1, "#fff");
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h * 0.55);
  ctx.globalAlpha = 1;
  ctx.textBaseline = "top";
  const text = (s: string, x: number, y: number, weight: number, size: number, color: string, align: CanvasTextAlign = "center") => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const lines = (s: string, weight: number, size: number, max: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return wrapText(s, w - 2 * m, (t) => ctx.measureText(t).width, max);
  };

  text(card.brand, m, m - 8, 800, 64, ACCENT, "left");
  let y = 200;
  text(card.eyebrow, w / 2, y, 600, 34, ACCENT);
  y += 56;
  for (const l of lines(card.title, 700, 64, 2)) {
    text(l, w / 2, y, 700, 64, INK);
    y += 76;
  }
  y += 24;

  if (card.score) {
    ctx.font = `800 200px ${FONT}`;
    const numW = ctx.measureText(String(card.score.value)).width;
    ctx.font = `600 64px ${FONT}`;
    const outW = ctx.measureText("/100").width;
    const x0 = (w - numW - outW - 8) / 2;
    text(String(card.score.value), x0, y, 800, 200, ACCENT, "left");
    text("/100", x0 + numW + 8, y + 128, 600, 64, SOFT, "left");
    y += 225;
    const barW = 640;
    ctx.fillStyle = "#e5e5ea";
    ctx.beginPath();
    ctx.roundRect((w - barW) / 2, y, barW, 22, 11);
    ctx.fill();
    const fill = ctx.createLinearGradient((w - barW) / 2, 0, (w + barW) / 2, 0);
    fill.addColorStop(0, accent2);
    fill.addColorStop(1, ACCENT);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect((w - barW) / 2, y, Math.max(22, (barW * card.score.value) / 100), 22, 11);
    ctx.fill();
    y += 50;
    for (const l of lines(card.score.category, 700, 52, 1)) {
      text(l, w / 2, y, 700, 52, INK);
      y += 62;
    }
    for (const l of lines(card.score.line, 400, 34, card.profile ? 2 : 4)) {
      text(l, w / 2, y, 400, 34, SOFT);
      y += 44;
    }
    y += 24;
  }

  if (card.profile) {
    const boxH = 190;
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(m, y, w - 2 * m, boxH, 36);
    ctx.fill();
    ctx.globalAlpha = 1;
    text("OUR FAMILY PROFILE", w / 2, y + 26, 700, 26, ACCENT);
    text(lines(card.profile.name, 700, 50, 1)[0] ?? "", w / 2, y + 66, 700, 50, INK);
    text(lines(card.profile.tagline, 400, 34, 1)[0] ?? "", w / 2, y + 128, 400, 34, SOFT);
  }

  text(card.cta, w / 2, h - m - 104, 700, 38, INK);
  text(card.link, w / 2, h - m - 50, 600, 34, ACCENT);
}

/** "Share your result" on the check-up's results page: a picture of the
 * result for the share sheet (Viber, Messenger, Facebook), or a download
 * where the phone has no share sheet. The person picks what is on it and
 * sees it before it goes anywhere; nothing is sent by Kin. */
export function ShareResult({ answers }: { answers: Answers }) {
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ShareChoice>({ score: true, profile: false });
  const [status, setStatus] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = origin ? shareCard(answers, choice, origin) : null;

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx && card) draw(ctx, card);
  });

  const share = async () => {
    const c = canvas.current;
    if (!c || !card || !origin) return;
    const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
    if (!blob) return setStatus("This phone couldn’t make the picture.");
    const how = await shareOrDownload(new File([blob], SHARE_FILE_NAME, { type: "image/png" }), { title: card.title, text: shareText(card, origin) });
    setStatus(how === "shared" ? "Shared." : "Saved to your downloads.");
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block kin-check-share-open" onClick={() => setOpen(true)} disabled={!origin}>
        Share your result
      </button>
    );
  }
  return (
    <div className="kin-check-share">
      <canvas ref={canvas} width={SHARE_SIZE.w} height={SHARE_SIZE.h} role="img" aria-label="Preview of the picture to share" />
      <fieldset>
        <legend>On the picture</legend>
        <label>
          <input type="checkbox" checked={choice.score} onChange={(e) => setChoice({ ...choice, score: e.target.checked })} /> Our score
        </label>
        <label>
          <input type="checkbox" checked={choice.profile} onChange={(e) => setChoice({ ...choice, profile: e.target.checked })} /> Our family profile
        </label>
      </fieldset>
      <p className="kin-check-note">Only what’s ticked, and a link to take the check-up. None of your answers.</p>
      <button type="button" className="btn btn-primary btn-block" onClick={share}>
        Share the picture
      </button>
      {status && <p role="status" className="kin-check-note">{status}</p>}
    </div>
  );
}
