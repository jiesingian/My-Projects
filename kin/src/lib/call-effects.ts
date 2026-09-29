"use client";

/** Video-call effects (28 September): colour filters and backgrounds, drawn on
 * the phone before the picture is sent, so the other person sees them and
 * nothing extra leaves the phone.
 *
 * The camera frame is drawn onto a canvas and the canvas becomes the video
 * track the call sends (RTCRtpSender.replaceTrack, in call-provider.tsx).
 * Backgrounds need to know where the person is: MediaPipe's selfie segmenter
 * (free, open source, runs in WebAssembly on the phone) gives a mask per
 * frame. Its engine is served by Kin itself from /mediapipe (copied from
 * node_modules at build, scripts/copy-mediapipe.mjs); the 250 KB model comes
 * from Google's pinned, versioned URL. Loaded only when a background is first
 * chosen, so a call that uses none never downloads anything.
 *
 * Nothing here relies on CanvasRenderingContext2D.filter, which older iPhones
 * lack: filters are a colour matrix, blur is a shrink-and-stretch. */

export type FilterId = "none" | "warm" | "cool" | "mono" | "vintage" | "bright" | "rosy";
export type BackgroundId = "none" | "blur" | "sunset" | "ocean" | "garden" | "studio" | "night" | "photo";
export type FaceId = "none" | "sunglasses" | "partyhat" | "bunny" | "cat";
export type HairStyleId = "none" | "afro" | "bun" | "pigtails" | "long" | "bob" | "mohawk";
export type HairColourId = "none" | "blonde" | "ginger" | "pink" | "blue" | "purple" | "silver";

/** Hairstyles (29 September) are drawn around the face, never over it: the
 * face's own outline from the face tracker is cut out of every style. */
export const HAIR_STYLES: { id: HairStyleId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "afro", label: "Afro" },
  { id: "bun", label: "Bun" },
  { id: "pigtails", label: "Pigtails" },
  { id: "long", label: "Long" },
  { id: "bob", label: "Bob" },
  { id: "mohawk", label: "Mohawk" },
];

/** Hair colours tint the person's real hair, found by MediaPipe's hair
 * segmenter, and also colour a drawn style. */
export const HAIR_COLOURS: { id: HairColourId; label: string; rgb: [number, number, number] }[] = [
  { id: "none", label: "Natural", rgb: [0, 0, 0] },
  { id: "blonde", label: "Blonde", rgb: [236, 200, 120] },
  { id: "ginger", label: "Ginger", rgb: [214, 96, 38] },
  { id: "pink", label: "Pink", rgb: [255, 105, 180] },
  { id: "blue", label: "Blue", rgb: [60, 130, 255] },
  { id: "purple", label: "Purple", rgb: [150, 80, 230] },
  { id: "silver", label: "Silver", rgb: [215, 215, 225] },
];

/** Recolours hair in place. `mask` is one byte per pixel (0-255, how sure the
 * segmenter is that it is hair). Colour is laid on the pixel's own lightness,
 * lifted so that black hair still takes a visible tint -- a plain hue swap
 * leaves dark hair dark. Pure, so it can be tested. */
export function tintHair(px: Uint8ClampedArray, mask: Uint8ClampedArray, rgb: [number, number, number], strength = 0.75) {
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const a = (mask[j] / 255) * strength;
    if (a <= 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const k = 0.45 + 0.75 * lum;
    px[i] = r + (rgb[0] * k - r) * a;
    px[i + 1] = g + (rgb[1] * k - g) * a;
    px[i + 2] = b + (rgb[2] * k - b) * a;
  }
}

/** The colour a drawn hairstyle is painted in: dark brown unless a colour is chosen. */
export function hairPaint(colour: HairColourId): string {
  const c = HAIR_COLOURS.find((h) => h.id === colour);
  if (!c || colour === "none") return "#3a2418";
  return `rgb(${c.rgb.map((v) => Math.round(v * 0.82)).join(",")})`;
}

export const FACES: { id: FaceId; label: string; glyph: string }[] = [
  { id: "none", label: "None", glyph: "" },
  { id: "sunglasses", label: "Shades", glyph: "🕶️" },
  { id: "partyhat", label: "Party hat", glyph: "🥳" },
  { id: "bunny", label: "Bunny", glyph: "🐰" },
  { id: "cat", label: "Cat", glyph: "🐱" },
];

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "mono", label: "B&W" },
  { id: "vintage", label: "Vintage" },
  { id: "bright", label: "Bright" },
  { id: "rosy", label: "Rosy" },
];

export const BACKGROUNDS: { id: BackgroundId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "blur", label: "Blur" },
  { id: "sunset", label: "Sunset" },
  { id: "ocean", label: "Ocean" },
  { id: "garden", label: "Garden" },
  { id: "studio", label: "Studio" },
  { id: "night", label: "Night" },
  { id: "photo", label: "Your photo" },
];

/** 4x5 colour matrices (RGBA rows, last column is an offset in 0-255). */
const MATRIX: Record<Exclude<FilterId, "none">, number[]> = {
  warm: [1.1, 0.05, 0, 0, 8, 0.02, 1.02, 0, 0, 2, 0, 0, 0.88, 0, -6, 0, 0, 0, 1, 0],
  cool: [0.9, 0, 0, 0, -4, 0, 1.0, 0.04, 0, 0, 0.02, 0.05, 1.12, 0, 8, 0, 0, 0, 1, 0],
  mono: [0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0.3, 0.59, 0.11, 0, 0, 0, 0, 0, 1, 0],
  vintage: [0.62, 0.32, 0.17, 0, 18, 0.22, 0.72, 0.15, 0, 10, 0.18, 0.28, 0.5, 0, 6, 0, 0, 0, 1, 0],
  bright: [1.12, 0, 0, 0, 14, 0, 1.12, 0, 0, 14, 0, 0, 1.12, 0, 14, 0, 0, 0, 1, 0],
  rosy: [1.12, 0.05, 0.02, 0, 10, 0, 0.96, 0.02, 0, 0, 0.02, 0, 1.0, 0, 6, 0, 0, 0, 1, 0],
};

/** Applies a colour matrix to pixels in place. Pure, so it can be tested. */
export function applyMatrix(px: Uint8ClampedArray, m: number[]) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    px[i] = m[0] * r + m[1] * g + m[2] * b + m[4];
    px[i + 1] = m[5] * r + m[6] * g + m[7] * b + m[9];
    px[i + 2] = m[10] * r + m[11] * g + m[12] * b + m[14];
  }
}

export function filterMatrix(id: FilterId): number[] | null {
  return id === "none" ? null : MATRIX[id];
}

/** The ready-made backgrounds are painted, not photographs: no picture files to
 * license or download, and each scales cleanly to any camera size. */
function paintBackground(ctx: CanvasRenderingContext2D, id: BackgroundId, w: number, h: number) {
  const lin = (stops: [number, string][], x0 = 0, y0 = 0, x1 = 0, y1 = h) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, c] of stops) g.addColorStop(at, c);
    return g;
  };
  const dots = (n: number, colour: (i: number) => string, rMin: number, rMax: number, seed: number) => {
    let s = seed;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colour(i);
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, rMin + rnd() * (rMax - rMin), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  switch (id) {
    case "sunset":
      ctx.fillStyle = lin([[0, "#2b1055"], [0.45, "#d53369"], [0.75, "#ff9a44"], [1, "#fcd581"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,236,170,0.85)";
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 0.66, h * 0.13, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ocean":
      ctx.fillStyle = lin([[0, "#8fd3f4"], [0.55, "#48b1d9"], [0.56, "#1e6f9f"], [1, "#0b3d5c"]]);
      ctx.fillRect(0, 0, w, h);
      dots(18, () => "rgba(255,255,255,0.18)", h * 0.01, h * 0.03, 7);
      break;
    case "garden":
      ctx.fillStyle = lin([[0, "#c6ea8d"], [1, "#3a7d44"]]);
      ctx.fillRect(0, 0, w, h);
      dots(40, (i) => (i % 3 ? "rgba(255,255,255,0.22)" : "rgba(255,221,120,0.35)"), h * 0.02, h * 0.09, 11);
      break;
    case "studio":
      ctx.fillStyle = (() => {
        const g = ctx.createRadialGradient(w / 2, h * 0.4, h * 0.05, w / 2, h * 0.5, h * 0.9);
        g.addColorStop(0, "#f4efe9");
        g.addColorStop(1, "#b9b0a5");
        return g;
      })();
      ctx.fillRect(0, 0, w, h);
      break;
    case "night":
      ctx.fillStyle = lin([[0, "#0f2027"], [0.6, "#203a43"], [1, "#2c5364"]]);
      ctx.fillRect(0, 0, w, h);
      dots(60, (i) => (i % 4 ? "rgba(255,255,255,0.7)" : "rgba(255,214,120,0.5)"), 0.6, h * 0.012, 3);
      break;
    default:
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, w, h);
  }
}

type Segmenter = {
  segmentForVideo: (v: HTMLVideoElement, ts: number) => { confidenceMasks?: { width: number; height: number; getAsFloat32Array: () => Float32Array; close: () => void }[]; close: () => void };
  close: () => void;
};

type Point = { x: number; y: number };
type Landmarker = { detectForVideo: (v: HTMLVideoElement, ts: number) => { faceLandmarks: Point[][] }; close: () => void };

let segmenterLoad: Promise<Segmenter> | null = null;
let landmarkerLoad: Promise<Landmarker> | null = null;

/** The face tracker for face effects: 3.7 MB, fetched the first time one is chosen. */
function loadLandmarker(): Promise<Landmarker> {
  landmarkerLoad ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`${window.location.origin}/mediapipe`);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: 2,
      });
    return (await make("GPU").catch(() => make("CPU"))) as unknown as Landmarker;
  })();
  landmarkerLoad.catch(() => {
    landmarkerLoad = null;
  });
  return landmarkerLoad;
}

/** Where a face effect goes, from MediaPipe's face-mesh points (0-1 of the
 * frame): eye corners 33/133 and 362/263, forehead 10, nose tip 1. Pure, so
 * the geometry can be tested without a camera. */
export function faceFrame(lm: Point[], w: number, h: number) {
  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const lOut = P(33), lIn = P(133), rIn = P(362), rOut = P(263);
  const leftEye = { x: (lOut.x + lIn.x) / 2, y: (lOut.y + lIn.y) / 2 };
  const rightEye = { x: (rIn.x + rOut.x) / 2, y: (rIn.y + rOut.y) / 2 };
  const span = Math.hypot(rOut.x - lOut.x, rOut.y - lOut.y);
  const angle = Math.atan2(rOut.y - lOut.y, rOut.x - lOut.x);
  return { leftEye, rightEye, span, angle, forehead: P(10), nose: P(1) };
}

function drawFace(ctx: CanvasRenderingContext2D, face: FaceId, lm: Point[], w: number, h: number) {
  const f = faceFrame(lm, w, h);
  const d = f.span;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Everything is drawn in the face's own frame: x along the eyes, y down the face.
  const inFaceFrame = (at: Point) => {
    ctx.translate(at.x, at.y);
    ctx.rotate(f.angle);
  };
  if (face === "sunglasses") {
    const mid = { x: (f.leftEye.x + f.rightEye.x) / 2, y: (f.leftEye.y + f.rightEye.y) / 2 };
    inFaceFrame(mid);
    const gap = Math.hypot(f.rightEye.x - f.leftEye.x, f.rightEye.y - f.leftEye.y) / 2;
    const lw = d * 0.3, lh = d * 0.2;
    ctx.fillStyle = "rgba(15,15,20,0.92)";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = d * 0.035;
    for (const sx of [-gap, gap]) {
      ctx.beginPath();
      ctx.roundRect(sx - lw / 2, -lh / 2, lw, lh, lh * 0.45);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(sx - lw * 0.18, -lh * 0.15, lw * 0.12, lh * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(15,15,20,0.92)";
    }
    ctx.beginPath();
    ctx.moveTo(-gap + lw / 2, -lh * 0.15);
    ctx.quadraticCurveTo(0, -lh * 0.45, gap - lw / 2, -lh * 0.15);
    ctx.stroke();
  } else if (face === "partyhat") {
    inFaceFrame(f.forehead);
    const hw = d * 0.55, hh = d * 1.35, base = -d * 0.1;
    ctx.beginPath();
    ctx.moveTo(-hw, base);
    ctx.lineTo(0, base - hh);
    ctx.lineTo(hw, base);
    ctx.closePath();
    const g = ctx.createLinearGradient(-hw, 0, hw, 0);
    g.addColorStop(0, "#ff4d8d");
    g.addColorStop(1, "#7b61ff");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,230,90,0.9)";
    ctx.lineWidth = d * 0.08;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-hw, base - (hh * i) / 4 + d * 0.15);
      ctx.lineTo(hw, base - (hh * i) / 4 - d * 0.15);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#ffe45a";
    ctx.beginPath();
    ctx.arc(0, base - hh, d * 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === "bunny") {
    inFaceFrame(f.forehead);
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * d * 0.32, -d * 0.55);
      ctx.rotate(sx * 0.18);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = d * 0.02;
      ctx.beginPath();
      ctx.ellipse(0, 0, d * 0.17, d * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f7a8c4";
      ctx.beginPath();
      ctx.ellipse(0, d * 0.04, d * 0.08, d * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (face === "cat") {
    inFaceFrame(f.nose);
    ctx.fillStyle = "#f28ab2";
    ctx.beginPath();
    ctx.moveTo(-d * 0.09, -d * 0.04);
    ctx.lineTo(d * 0.09, -d * 0.04);
    ctx.lineTo(0, d * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(40,40,40,0.85)";
    ctx.lineWidth = d * 0.018;
    for (const sx of [-1, 1]) {
      for (const dy of [-0.06, 0.04, 0.14]) {
        ctx.beginPath();
        ctx.moveTo(sx * d * 0.16, d * 0.1 + dy * d * 0.3);
        ctx.lineTo(sx * d * 0.62, d * 0.02 + dy * d * 1.2);
        ctx.stroke();
      }
    }
    // Ears, from the forehead.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    inFaceFrame(f.forehead);
    ctx.fillStyle = "#3b3b3b";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * d * 0.2, -d * 0.2);
      ctx.lineTo(sx * d * 0.62, -d * 0.95);
      ctx.lineTo(sx * d * 0.72, -d * 0.15);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** MediaPipe's face-oval points, in order round the face. */
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** Where a hairstyle goes: the face's width (cheek 234 to cheek 454), its
 * tilt, the hairline (10), the chin (152), and the outline to cut the face
 * out of the hair. Pure, so it can be tested without a camera. */
export function hairFrame(lm: Point[], w: number, h: number) {
  const P = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const l = P(234), r = P(454);
  const width = Math.hypot(r.x - l.x, r.y - l.y);
  const angle = Math.atan2(r.y - l.y, r.x - l.x);
  const hairline = P(10), chin = P(152);
  const length = Math.hypot(chin.x - hairline.x, chin.y - hairline.y);
  return { width, angle, hairline, chin, length, oval: FACE_OVAL.map(P) };
}

export function drawHair(ctx: CanvasRenderingContext2D, style: HairStyleId, paint: string, lm: Point[], w: number, h: number) {
  const f = hairFrame(lm, w, h);
  const W = f.width, L = f.length;
  ctx.save();
  // Hair everywhere except the face: the frame, minus the face's outline.
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  f.oval.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip("evenodd");
  // From here on: origin at the hairline, x across the face, y down it.
  ctx.translate(f.hairline.x, f.hairline.y);
  ctx.rotate(f.angle);
  ctx.fillStyle = paint;
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = Math.max(1, W * 0.012);
  ctx.lineCap = "round";
  const blob = (x: number, y: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  // A cap over the crown, which most styles start from.
  const cap = () => blob(0, L * 0.12, W * 0.6, L * 0.62);
  // A few strands so the hair reads as hair rather than a hat.
  const strands = (x0: number, x1: number, y0: number, y1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.quadraticCurveTo(x + W * 0.04, (y0 + y1) / 2, x, y1);
      ctx.stroke();
    }
  };
  if (style === "afro") {
    const cy = L * 0.05, R = W * 0.95;
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * Math.PI * 2;
      blob(Math.cos(t) * R * 0.78, cy + Math.sin(t) * R * 0.8, R * 0.32, R * 0.32);
    }
    blob(0, cy, R * 0.85, R * 0.88);
  } else if (style === "bun") {
    cap();
    blob(0, -L * 0.62, W * 0.26, W * 0.24);
    ctx.stroke();
    strands(-W * 0.4, W * 0.4, -L * 0.35, -L * 0.05, 6);
  } else if (style === "pigtails") {
    cap();
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(sx * W * 0.62, L * 0.2);
      ctx.rotate(sx * -0.35);
      blob(0, L * 0.35, W * 0.17, L * 0.42);
      ctx.fillStyle = "#e84a7f";
      blob(0, -L * 0.04, W * 0.09, W * 0.06);
      ctx.restore();
    }
  } else if (style === "long") {
    cap();
    ctx.beginPath();
    ctx.moveTo(-W * 0.6, L * 0.1);
    ctx.quadraticCurveTo(-W * 0.78, L * 0.9, -W * 0.55, L * 1.55);
    ctx.lineTo(W * 0.55, L * 1.55);
    ctx.quadraticCurveTo(W * 0.78, L * 0.9, W * 0.6, L * 0.1);
    ctx.closePath();
    ctx.fill();
    strands(-W * 0.6, -W * 0.4, L * 0.25, L * 1.45, 3);
    strands(W * 0.4, W * 0.6, L * 0.25, L * 1.45, 3);
  } else if (style === "bob") {
    cap();
    ctx.beginPath();
    ctx.moveTo(-W * 0.6, L * 0.05);
    ctx.quadraticCurveTo(-W * 0.72, L * 0.6, -W * 0.6, L * 0.82);
    ctx.lineTo(W * 0.6, L * 0.82);
    ctx.quadraticCurveTo(W * 0.72, L * 0.6, W * 0.6, L * 0.05);
    ctx.closePath();
    ctx.fill();
    strands(-W * 0.45, W * 0.45, -L * 0.3, L * 0.02, 7);
  } else if (style === "mohawk") {
    ctx.beginPath();
    ctx.moveTo(-W * 0.14, L * 0.02);
    for (let i = 0; i < 6; i++) {
      const y = -L * 0.02 - i * L * 0.09;
      ctx.lineTo(-W * 0.4 - i * W * 0.02, y - L * 0.06);
      ctx.lineTo(-W * 0.1, y - L * 0.09);
    }
    ctx.lineTo(0, -L * 0.72);
    for (let i = 5; i >= 0; i--) {
      const y = -L * 0.02 - i * L * 0.09;
      ctx.lineTo(W * 0.1, y - L * 0.09);
      ctx.lineTo(W * 0.4 + i * W * 0.02, y - L * 0.06);
    }
    ctx.lineTo(W * 0.14, L * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

let hairLoad: Promise<Segmenter> | null = null;

/** The hair finder for hair colours: MediaPipe's hair segmenter, about 780 KB,
 * fetched the first time a colour is chosen. */
function loadHairSegmenter(): Promise<Segmenter> {
  hairLoad ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`${window.location.origin}/mediapipe`);
    const make = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite",
          delegate,
        },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    return (await make("GPU").catch(() => make("CPU"))) as unknown as Segmenter;
  })();
  hairLoad.catch(() => {
    hairLoad = null;
  });
  return hairLoad;
}

/** One segmenter for the whole app, made the first time a background is chosen. */
function loadSegmenter(): Promise<Segmenter> {
  segmenterLoad ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`${window.location.origin}/mediapipe`);
    const make = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
          delegate,
        },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    // The GPU path is far quicker; some phones refuse it, so fall back.
    return (await make("GPU").catch(() => make("CPU"))) as unknown as Segmenter;
  })();
  segmenterLoad.catch(() => {
    segmenterLoad = null;
  });
  return segmenterLoad;
}

const MAX_W = 640;

export class EffectsPipeline {
  readonly output: MediaStreamTrack;
  private video = document.createElement("video");
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private person = document.createElement("canvas");
  private pctx: CanvasRenderingContext2D;
  private mask = document.createElement("canvas");
  private mctx: CanvasRenderingContext2D;
  private small = document.createElement("canvas");
  private sctx: CanvasRenderingContext2D;
  private bg = document.createElement("canvas");
  private bgFor = "";
  private filter: FilterId = "none";
  private background: BackgroundId = "none";
  private photo: HTMLImageElement | null = null;
  private segmenter: Segmenter | null = null;
  private face: FaceId = "none";
  private landmarker: Landmarker | null = null;
  private faces: Point[][] = [];
  private hairStyle: HairStyleId = "none";
  private hairColour: HairColourId = "none";
  private hairSegmenter: Segmenter | null = null;
  private hairMask = document.createElement("canvas");
  private hmctx: CanvasRenderingContext2D;
  private hairFull = document.createElement("canvas");
  private hfctx: CanvasRenderingContext2D;
  private hairAlpha: Uint8ClampedArray | null = null;
  private frame = 0;
  private running = true;
  private timer = 0;

  constructor(source: MediaStreamTrack) {
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
    this.pctx = this.person.getContext("2d")!;
    this.mctx = this.mask.getContext("2d")!;
    this.sctx = this.small.getContext("2d")!;
    this.hmctx = this.hairMask.getContext("2d")!;
    this.hfctx = this.hairFull.getContext("2d", { willReadFrequently: true })!;
    this.video.muted = true;
    this.video.playsInline = true;
    this.setSource(source);
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.output = this.canvas.captureStream(24).getVideoTracks()[0];
    this.loop();
  }

  /** A new camera (flip) keeps the same outgoing track and effects. */
  setSource(track: MediaStreamTrack) {
    this.video.srcObject = new MediaStream([track]);
    void this.video.play().catch(() => {});
  }

  get active() {
    return this.filter !== "none" || this.background !== "none" || this.face !== "none" || this.hairStyle !== "none" || this.hairColour !== "none";
  }

  /** A hairstyle and hair colour. A style needs the face tracker, a colour the
   * hair segmenter; each is loaded the first time it is wanted. */
  async setHair(style: HairStyleId, colour: HairColourId) {
    if (style !== "none" && !this.landmarker) this.landmarker = await loadLandmarker();
    if (colour !== "none" && !this.hairSegmenter) this.hairSegmenter = await loadHairSegmenter();
    this.hairStyle = style;
    this.hairColour = colour;
    this.hairAlpha = null;
  }

  /** A face effect; the tracker is loaded the first time one is chosen. */
  async setFace(face: FaceId) {
    if (face !== "none" && !this.landmarker) this.landmarker = await loadLandmarker();
    this.face = face;
    this.faces = [];
  }

  async set(filter: FilterId, background: BackgroundId, photo?: HTMLImageElement | null) {
    this.filter = filter;
    if (photo !== undefined) this.photo = photo;
    if (background !== "none" && !this.segmenter) this.segmenter = await loadSegmenter();
    this.background = background;
    this.bgFor = "";
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    this.output.stop();
    this.video.srcObject = null;
  }

  private loop = () => {
    if (!this.running) return;
    try {
      this.draw();
    } catch {
      // A frame that fails to draw is skipped; the next one tries again.
    }
    this.timer = window.setTimeout(this.loop, 1000 / 24);
  };

  private draw() {
    const v = this.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    const scale = Math.min(1, MAX_W / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = this.person.width = w;
      this.canvas.height = this.person.height = h;
      this.bgFor = "";
    }
    const ctx = this.ctx;

    if (this.background === "none" || !this.segmenter) {
      ctx.drawImage(v, 0, 0, w, h);
    } else {
      // 1. The background.
      if (this.background === "blur") {
        // Shrink to a sixteenth and stretch back: a soft blur without ctx.filter.
        this.small.width = Math.max(1, Math.round(w / 16));
        this.small.height = Math.max(1, Math.round(h / 16));
        this.sctx.drawImage(v, 0, 0, this.small.width, this.small.height);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.small, 0, 0, w, h);
      } else {
        const key = `${this.background}:${w}x${h}:${this.photo?.src ?? ""}`;
        if (this.bgFor !== key) {
          this.bg.width = w;
          this.bg.height = h;
          const b = this.bg.getContext("2d")!;
          if (this.background === "photo" && this.photo) {
            const s = Math.max(w / this.photo.naturalWidth, h / this.photo.naturalHeight);
            const pw = this.photo.naturalWidth * s;
            const ph = this.photo.naturalHeight * s;
            b.drawImage(this.photo, (w - pw) / 2, (h - ph) / 2, pw, ph);
          } else paintBackground(b, this.background, w, h);
          this.bgFor = key;
        }
        ctx.drawImage(this.bg, 0, 0);
      }
      // 2. The person, cut out by this frame's mask.
      const result = this.segmenter.segmentForVideo(v, performance.now());
      const m = result.confidenceMasks?.[0];
      if (m) {
        const data = m.getAsFloat32Array();
        if (this.mask.width !== m.width || this.mask.height !== m.height) {
          this.mask.width = m.width;
          this.mask.height = m.height;
        }
        const img = this.mctx.createImageData(m.width, m.height);
        for (let i = 0; i < data.length; i++) img.data[i * 4 + 3] = Math.min(255, Math.max(0, (data[i] - 0.25) * 2 * 255));
        this.mctx.putImageData(img, 0, 0);
        const p = this.pctx;
        p.globalCompositeOperation = "source-over";
        p.clearRect(0, 0, w, h);
        p.drawImage(v, 0, 0, w, h);
        p.globalCompositeOperation = "destination-in";
        p.imageSmoothingEnabled = true;
        p.drawImage(this.mask, 0, 0, w, h);
        ctx.drawImage(this.person, 0, 0);
      }
      result.close();
    }

    // 3. Hair colour, found every other frame, then the colour filter over
    // everything -- one read of the pixels for both.
    const even = this.frame++ % 2 === 0;
    const tint = HAIR_COLOURS.find((c) => c.id === this.hairColour && c.id !== "none");
    if (tint && this.hairSegmenter && (even || !this.hairAlpha || this.hairAlpha.length !== w * h)) this.findHair(v, w, h);
    const matrix = filterMatrix(this.filter);
    if (matrix || (tint && this.hairAlpha)) {
      const frame = ctx.getImageData(0, 0, w, h);
      if (tint && this.hairAlpha?.length === w * h) tintHair(frame.data, this.hairAlpha, tint.rgb);
      if (matrix) applyMatrix(frame.data, matrix);
      ctx.putImageData(frame, 0, 0);
    }

    // 4. Hairstyles, then face effects, drawn over the filter so their colours
    // stay true (and sunglasses sit over a fringe). The face is found every
    // other frame and drawn every frame.
    if ((this.face !== "none" || this.hairStyle !== "none") && this.landmarker) {
      if (even) this.faces = this.landmarker.detectForVideo(v, performance.now()).faceLandmarks ?? [];
      for (const lm of this.faces) {
        if (lm.length < 455) continue;
        if (this.hairStyle !== "none") drawHair(ctx, this.hairStyle, hairPaint(this.hairColour), lm, w, h);
        if (this.face !== "none") drawFace(ctx, this.face, lm, w, h);
      }
    }
  }

  /** Where the hair is in this frame, as one byte per output pixel. */
  private findHair(v: HTMLVideoElement, w: number, h: number) {
    const result = this.hairSegmenter!.segmentForVideo(v, performance.now());
    const masks = result.confidenceMasks ?? [];
    const m = masks[masks.length - 1]; // the last category is hair
    if (m) {
      const data = m.getAsFloat32Array();
      if (this.hairMask.width !== m.width || this.hairMask.height !== m.height) {
        this.hairMask.width = m.width;
        this.hairMask.height = m.height;
      }
      const img = this.hmctx.createImageData(m.width, m.height);
      for (let i = 0; i < data.length; i++) img.data[i * 4 + 3] = Math.min(255, Math.max(0, (data[i] - 0.3) * 2.5 * 255));
      this.hmctx.putImageData(img, 0, 0);
      if (this.hairFull.width !== w || this.hairFull.height !== h) {
        this.hairFull.width = w;
        this.hairFull.height = h;
      }
      this.hfctx.clearRect(0, 0, w, h);
      this.hfctx.imageSmoothingEnabled = true;
      this.hfctx.drawImage(this.hairMask, 0, 0, w, h);
      const px = this.hfctx.getImageData(0, 0, w, h).data;
      const alpha = this.hairAlpha?.length === w * h ? this.hairAlpha : new Uint8ClampedArray(w * h);
      for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = px[j];
      this.hairAlpha = alpha;
    }
    result.close();
  }
}
