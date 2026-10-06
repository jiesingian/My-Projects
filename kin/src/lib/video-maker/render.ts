/** Draws and records a video made from an entry's photos, entirely on the
 * phone. The photos are fetched from where Kin already keeps them, drawn on a
 * canvas frame by frame from the plan (timeline.ts), and recorded with
 * MediaRecorder together with the music (music.ts).
 *
 * Why MediaRecorder and not WebCodecs: it is the one that works on the
 * widest range of phones today, iPhone Safari included, and there it writes
 * MP4 (H.264 and AAC) that plays everywhere. Chrome writes MP4 too since
 * version 126; older Chrome and Firefox write WebM, which Kin plays back fine.
 * The price is that recording runs in real time -- a 40-second video takes
 * 40 seconds -- and the page has to stay open meanwhile, which the maker says.
 * WebCodecs would be quicker, but on iPhone it cannot yet encode the music. */

import { opacityAt, progressAt, segmentsAt, type LookId, type Plan, type Segment } from "@/lib/video-maker/timeline";

export type Shape = "wide" | "tall";
/** 720p, either way round: small enough for mobile data, sharp enough on a TV. */
export const FRAME: Record<Shape, { w: number; h: number }> = {
  wide: { w: 1280, h: 720 },
  tall: { w: 720, h: 1280 },
};

/** One photo, loaded once and kept at a size that covers the frame with room
 * to zoom -- a phone cannot hold twenty 12-megapixel photos in memory. */
export type LoadedPhoto = { base: HTMLCanvasElement; tiny: HTMLCanvasElement };

export type Cards = { title: string; date: string; signature: string };

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Signed Storage links are another origin; without this the canvas would
    // be "tainted" and could not be recorded. Kin's own Drive route is ours.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const abort = () => {
      img.src = "";
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    img.onload = () => {
      signal?.removeEventListener("abort", abort);
      resolve(img);
    };
    img.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(new Error("A photo couldn't be loaded."));
    };
    img.src = url;
  });
}

/** Loads a photo and scales it down to what the video can use. */
export async function loadPhoto(url: string, maxSide: number, signal?: AbortSignal): Promise<LoadedPhoto> {
  const img = await loadImage(url, signal);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const base = canvas(w * k, h * k);
  const bctx = base.getContext("2d")!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(img, 0, 0, base.width, base.height);
  // A small, blurred copy: drawn back up to fill the frame, it is how a photo
  // that doesn't fit the frame gets its background, and what the title and
  // end cards sit on. Blurred by hand, a few passes of a box blur on a copy a
  // hundred-odd pixels across -- the canvas filter property is missing on
  // older iPhones, and simply stretching a tiny copy leaves blocky smudges.
  const tk = 120 / Math.max(w, h);
  const tiny = canvas(w * tk, h * tk);
  const tctx = tiny.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(base, 0, 0, tiny.width, tiny.height);
  const pixels = tctx.getImageData(0, 0, tiny.width, tiny.height);
  for (let pass = 0; pass < 3; pass++) boxBlur(pixels, 4);
  tctx.putImageData(pixels, 0, 0);
  return { base, tiny };
}

/** One pass of a box blur, across then down; three passes look Gaussian.
 * Edges repeat their last pixel, so the border never darkens. */
function boxBlur(img: ImageData, r: number) {
  const { width: w, height: h, data } = img;
  const tmp = new Float32Array(data.length);
  const pass = (src: ArrayLike<number>, dst: Float32Array | Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const span = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      const at = (i: number) => {
        const k = Math.min(len - 1, Math.max(0, i));
        return 4 * (horizontal ? line * w + k : k * w + line);
      };
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let i = -r; i <= r; i++) sum += src[at(i) + c];
        for (let i = 0; i < len; i++) {
          dst[at(i) + c] = sum / span;
          sum += src[at(i + r + 1) + c] - src[at(i - r) + c];
        }
      }
    }
  };
  pass(data, tmp, true);
  pass(tmp, data, false);
}

type Grade = { ops: { mode: GlobalCompositeOperation; color: string; alpha: number }[]; selfOverlay: number; vignette: number };

/** Each look's colour, done with blend modes (which every phone's canvas has)
 * rather than filters (which older iPhones don't). Kept light: it should read
 * as a mood, never as an effect. */
const GRADES: Record<LookId, Grade> = {
  warm: {
    ops: [
      { mode: "soft-light", color: "#ffb35c", alpha: 0.32 },
      { mode: "screen", color: "#3b2410", alpha: 0.1 },
    ],
    selfOverlay: 0,
    vignette: 0.38,
  },
  classic: {
    ops: [
      { mode: "saturation", color: "#808080", alpha: 0.55 },
      { mode: "soft-light", color: "#f2dfbd", alpha: 0.35 },
      { mode: "screen", color: "#2a2520", alpha: 0.14 },
    ],
    selfOverlay: 0,
    vignette: 0.48,
  },
  lively: {
    ops: [{ mode: "soft-light", color: "#ffffff", alpha: 0.12 }],
    selfOverlay: 0.22,
    vignette: 0.2,
  },
};

const TYPE: Record<LookId, { family: string; weight: number; ink: string; soft: string; shade: string }> = {
  warm: { family: 'var(--font-heading)', weight: 600, ink: "#fff8ef", soft: "rgba(255,240,222,0.82)", shade: "rgba(40,20,5,0.55)" },
  classic: { family: 'ui-serif, "New York", Georgia, "Times New Roman", serif', weight: 500, ink: "#f5ecdc", soft: "rgba(245,236,220,0.8)", shade: "rgba(20,16,12,0.62)" },
  lively: { family: 'var(--font-heading)', weight: 700, ink: "#ffffff", soft: "rgba(255,255,255,0.86)", shade: "rgba(8,20,40,0.5)" },
};

/** The app's own fonts are CSS variables; a canvas needs the families themselves. */
function resolveFamily(family: string): string {
  if (!family.startsWith("var(")) return family;
  const name = family.slice(4, -1).trim();
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "system-ui, sans-serif";
}

function graded(src: HTMLCanvasElement, look: LookId): HTMLCanvasElement {
  const g = GRADES[look];
  const c = canvas(src.width, src.height);
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  if (g.selfOverlay) {
    x.globalCompositeOperation = "overlay";
    x.globalAlpha = g.selfOverlay;
    x.drawImage(src, 0, 0);
  }
  for (const op of g.ops) {
    x.globalCompositeOperation = op.mode;
    x.globalAlpha = op.alpha;
    x.fillStyle = op.color;
    x.fillRect(0, 0, c.width, c.height);
  }
  x.globalCompositeOperation = "source-over";
  x.globalAlpha = 1;
  return c;
}

function vignette(w: number, h: number, strength: number): HTMLCanvasElement {
  const c = canvas(w, h);
  const x = c.getContext("2d")!;
  const r = Math.hypot(w, h) / 2;
  const grad = x.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${strength})`);
  x.fillStyle = grad;
  x.fillRect(0, 0, w, h);
  return c;
}

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** Draws any moment of a plan onto a canvas. The preview and the recording
 * are the same drawing, so what was previewed is what gets made. */
export class Stage {
  private ctx: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private graded: HTMLCanvasElement[];
  private tinies: HTMLCanvasElement[];
  private vig: HTMLCanvasElement;
  private type: (typeof TYPE)[LookId] & { resolved: string };

  constructor(
    private target: HTMLCanvasElement,
    private plan: Plan,
    private photos: LoadedPhoto[],
    private cards: Cards,
  ) {
    this.ctx = target.getContext("2d", { alpha: false })!;
    this.w = target.width;
    this.h = target.height;
    const look = plan.look.id;
    this.graded = photos.slice(0, plan.used).map((p) => graded(p.base, look));
    // The blurred backgrounds carry the look too, or the title card of a
    // Warm video would be the one cold frame in it.
    this.tinies = photos.slice(0, plan.used).map((p) => graded(p.tiny, look));
    this.vig = vignette(this.w, this.h, GRADES[look].vignette);
    this.type = { ...TYPE[look], resolved: resolveFamily(TYPE[look].family) };
  }

  draw(t: number) {
    const { ctx, w, h } = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, w, h);
    for (const seg of segmentsAt(this.plan, t)) {
      const a = opacityAt(seg, t, this.plan.look.fade);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (seg.kind === "photo") this.photo(seg, t);
      else this.card(seg, t);
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(this.vig, 0, 0);
  }

  private backdrop(index: number, dim: number) {
    const { ctx, w, h } = this;
    const tiny = this.tinies[index];
    if (!tiny) return;
    const k = Math.max(w / tiny.width, h / tiny.height) * 1.15;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tiny, (w - tiny.width * k) / 2, (h - tiny.height * k) / 2, tiny.width * k, tiny.height * k);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * dim;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
  }

  private photo(seg: Extract<Segment, { kind: "photo" }>, t: number) {
    const { ctx, w, h } = this;
    const img = this.graded[seg.index];
    if (!img) return;
    const p = progressAt(seg, t);
    const m = seg.motion;
    const k = m.fromScale + (m.toScale - m.fromScale) * p;
    const dx = m.fromX + (m.toX - m.fromX) * p;
    const dy = m.fromY + (m.toY - m.fromY) * p;

    // A photo close to the frame's shape fills it. One that isn't -- a
    // portrait photo in a wide video -- would lose most of itself to the crop
    // (and usually someone's head), so it is shown whole over a soft, dimmed
    // blur of itself, the way phones show it.
    const r = img.width / img.height / (w / h);
    const fill = r > 0.72 && r < 1.4;
    let scale: number;
    if (fill) {
      scale = Math.max(w / img.width, h / img.height) * k;
    } else {
      this.backdrop(seg.index, 0.35);
      // Whole, with a little air, and a gentler move than a full-frame photo.
      scale = Math.min(w / img.width, h / img.height) * (0.94 + (k - 1) * 0.5);
    }
    const dw = img.width * scale;
    const dh = img.height * scale;
    const x = (w - dw) / 2 + (dx * Math.max(0, dw - w)) / 2;
    const y = (h - dh) / 2 + (dy * Math.max(0, dh - h)) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, dw, dh);
  }

  private card(seg: Segment, t: number) {
    const { ctx, w, h } = this;
    const title = seg.kind === "title";
    const index = title ? 0 : Math.max(0, this.plan.used - 1);
    // The title card is the first photo, blurred and slowly drawing closer;
    // the end card the last one, darker, settling.
    const p = progressAt(seg, t);
    ctx.save();
    const z = title ? 1 + 0.06 * p : 1.06 - 0.04 * p;
    ctx.translate(w / 2, h / 2);
    ctx.scale(z, z);
    ctx.translate(-w / 2, -h / 2);
    this.backdrop(index, title ? 0.42 : 0.55);
    ctx.restore();

    const local = t - seg.start;
    const alpha = ctx.globalAlpha;
    const unit = Math.min(w, h);
    const ty = this.type;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ty.shade;
    ctx.shadowBlur = unit * 0.04;

    const rise = (delay: number) => {
      const e = easeOut((local - delay) / 0.9);
      return { a: alpha * e, dy: (1 - e) * unit * 0.025 };
    };

    if (title) {
      const size = unit * (this.cards.title.length > 40 ? 0.075 : 0.095);
      ctx.font = `${ty.weight} ${Math.round(size)}px ${ty.resolved}`;
      const lines = wrap(ctx, this.cards.title, w * 0.8, 3);
      const lineH = size * 1.12;
      const block = lines.length * lineH;
      const top = h / 2 - block / 2 - unit * 0.03;
      const a = rise(0.25);
      ctx.globalAlpha = a.a;
      ctx.fillStyle = ty.ink;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, top + lineH * (i + 0.5) + a.dy));
      const b = rise(0.65);
      ctx.globalAlpha = b.a;
      ctx.fillStyle = ty.soft;
      ctx.font = `500 ${Math.round(unit * 0.036)}px ${resolveFamily("var(--font-body)")}`;
      spaced(ctx, this.cards.date.toUpperCase(), w / 2, top + block + unit * 0.06 + b.dy, unit * 0.004);
    } else {
      const a = rise(0.3);
      ctx.globalAlpha = a.a;
      ctx.fillStyle = ty.ink;
      ctx.font = `${ty.weight} ${Math.round(unit * 0.07)}px ${ty.resolved}`;
      const lines = wrap(ctx, this.cards.signature, w * 0.8, 2);
      const lineH = unit * 0.08;
      const top = h / 2 - (lines.length * lineH) / 2 - unit * 0.03;
      lines.forEach((line, i) => ctx.fillText(line, w / 2, top + lineH * (i + 0.5) + a.dy));
      const b = rise(0.7);
      ctx.globalAlpha = b.a;
      ctx.fillStyle = ty.soft;
      ctx.font = `500 ${Math.round(unit * 0.034)}px ${resolveFamily("var(--font-body)")}`;
      spaced(ctx, this.cards.date.toUpperCase(), w / 2, top + lines.length * lineH + unit * 0.05 + b.dy, unit * 0.004);
      const c = rise(1.1);
      ctx.globalAlpha = c.a * 0.7;
      ctx.font = `500 ${Math.round(unit * 0.028)}px ${resolveFamily("var(--font-body)")}`;
      ctx.fillText("made with Kin", w / 2, h - unit * 0.09 + c.dy);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha;
  }
}

/** Breaks text into at most `max` lines that fit, ending with … if it had to cut. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}…`;
  return kept;
}

/** Small capitals read better a little apart. ctx.letterSpacing is newer than
 * some of the phones this runs on, so the spacing is done by hand. */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, gap: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (text.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = "left";
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + gap;
  });
  ctx.textAlign = align;
}

/** The best format this browser can record: MP4 where it can (iPhone, recent
 * Chrome), WebM otherwise. Null when it cannot record video at all. */
export function pickRecordingType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement.prototype.captureStream !== "function") return null;
  const candidates = [
    "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}

export class RecordingHidden extends Error {
  constructor() {
    super("Kin was put in the background, so the video stopped. Keep Kin open while it's made, then try again.");
  }
}

/** Records the whole plan in real time. The clock is the audio's own, so the
 * pictures follow the music exactly; with no music it is the screen's. */
export async function record(opts: {
  target: HTMLCanvasElement;
  stage: Stage;
  plan: Plan;
  music: AudioBuffer | null;
  audio: AudioContext | null;
  mimeType: string;
  signal: AbortSignal;
  onProgress: (fraction: number) => void;
}): Promise<Blob> {
  const { target, stage, plan, music, audio, mimeType, signal, onProgress } = opts;
  const stream = target.captureStream(30);
  let source: AudioBufferSourceNode | null = null;
  if (music && audio) {
    const dest = audio.createMediaStreamDestination();
    source = audio.createBufferSource();
    source.buffer = music;
    source.connect(dest);
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;
    let failed: Error | null = null;
    const stopAll = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onHidden);
      signal.removeEventListener("abort", onAbort);
      try {
        source?.stop();
      } catch {}
      stream.getTracks().forEach((tr) => tr.stop());
    };
    const fail = (err: Error) => {
      if (failed) return;
      failed = err;
      stopAll();
      if (recorder.state !== "inactive") recorder.stop();
      else reject(err);
    };
    const onAbort = () => fail(new DOMException("Cancelled", "AbortError") as unknown as Error);
    const onHidden = () => {
      if (document.visibilityState === "hidden") fail(new RecordingHidden());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    document.addEventListener("visibilitychange", onHidden);

    recorder.onstop = () => {
      if (failed) reject(failed);
      else resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
    };
    recorder.onerror = () => fail(new Error("This phone stopped recording the video."));

    stage.draw(0);
    recorder.start(1000);
    const lead = 0.12;
    const t0 = audio ? audio.currentTime + lead : performance.now() / 1000 + lead;
    source?.start(t0);
    const now = () => (audio ? audio.currentTime : performance.now() / 1000) - t0;

    const tick = () => {
      if (failed) return;
      const t = Math.max(0, now());
      stage.draw(Math.min(t, plan.duration));
      onProgress(Math.min(1, t / plan.duration));
      if (t >= plan.duration) {
        // Hold the last frame a moment so the recorder has it, then finish.
        window.setTimeout(() => {
          stopAll();
          if (recorder.state !== "inactive") recorder.stop();
        }, 200);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}

/** A still for the entry before the video loads: the title card, once its words are in. */
export function posterOf(stage: Stage, target: HTMLCanvasElement, plan: Plan): Promise<Blob> {
  const title = plan.segments[0];
  stage.draw(Math.min(title.end - plan.look.fade - 0.05, 1.6));
  return new Promise((resolve, reject) =>
    target.toBlob((b) => (b ? resolve(b) : reject(new Error("The poster couldn't be made."))), "image/jpeg", 0.84),
  );
}
