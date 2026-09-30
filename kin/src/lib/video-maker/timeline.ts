/** The plan for a video made from an entry's photos: which look, which
 * music, and when each card and photo comes and goes. Pure -- no canvas, no
 * audio -- so the rules are testable (e2e/video-timeline.logic.spec.ts) and
 * the preview and the recording draw from exactly the same plan.
 *
 * The shape is a wedding's same-day edit, kept short: a title card, each
 * photo with a slow zoom and drift (Ken Burns), crossfades between them, an
 * end card. Cuts land on the music's beats, which is most of what makes a
 * slideshow feel edited rather than timed. */

export type LookId = "warm" | "classic" | "lively";
export type TrackId = "gentle" | "waltz" | "bright" | "none";

export type Look = {
  id: LookId;
  name: string;
  line: string;
  /** Seconds between one photo arriving and the next, before snapping to the beat. */
  step: number;
  /** Length of each crossfade, seconds. */
  fade: number;
  /** How far a photo zooms over its time on screen: 0.1 is 10%. */
  zoom: number;
  /** The tune this look starts with. */
  track: Exclude<TrackId, "none">;
};

export const LOOKS: Record<LookId, Look> = {
  warm: { id: "warm", name: "Warm", line: "Golden, slow, soft", step: 2.5, fade: 0.9, zoom: 0.1, track: "gentle" },
  classic: { id: "classic", name: "Classic", line: "Faded film, gentle", step: 2.3, fade: 1.2, zoom: 0.07, track: "waltz" },
  lively: { id: "lively", name: "Lively", line: "Bright, quicker cuts", step: 1.6, fade: 0.5, zoom: 0.14, track: "bright" },
};

export type Track = { id: TrackId; name: string; bpm: number };

/** Kin's own tunes, written for it in code (lib/video-maker/music.ts) and
 * dedicated to the public domain -- nothing is licensed from anyone, and
 * nothing is fetched. */
export const TRACKS: Record<TrackId, Track> = {
  gentle: { id: "gentle", name: "Gentle piano", bpm: 72 },
  waltz: { id: "waltz", name: "Music box waltz", bpm: 90 },
  bright: { id: "bright", name: "Bright day", bpm: 116 },
  // With no music there is no beat to land on; a 60 bpm "beat" of one second
  // keeps the arithmetic below the same.
  none: { id: "none", name: "No music", bpm: 60 },
};

/** The longest a video may run, and the shortest a photo may stay. */
export const MAX_SECONDS = 60;
export const MIN_PHOTO_SECONDS = 2;
export const MAX_PHOTO_SECONDS = 4;
export const END_SECONDS = 3;

export type Motion = {
  /** Scale at the start and end of the photo's time on screen (1 = fills the frame). */
  fromScale: number;
  toScale: number;
  /** Where the frame sits within the photo's spare room, -1 to 1 on each axis. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export type Segment =
  | { kind: "title"; start: number; end: number }
  | { kind: "photo"; index: number; start: number; end: number; motion: Motion }
  | { kind: "end"; start: number; end: number };

export type Plan = {
  look: Look;
  track: Track;
  segments: Segment[];
  duration: number;
  /** Seconds each photo is on screen, crossfades included. */
  photoSeconds: number;
  /** How many of the chosen photos fit; the rest were left out to keep it under a minute. */
  used: number;
  dropped: number;
};

// Drift directions, taken in turn so neighbouring photos never move the same
// way twice: across, down, diagonally, back.
const DRIFTS: [number, number, number, number][] = [
  [-0.6, 0.2, 0.6, -0.2],
  [0.2, -0.7, -0.2, 0.5],
  [0.7, 0.5, -0.5, -0.4],
  [-0.4, 0.6, 0.3, -0.6],
  [0.5, -0.3, -0.7, 0.3],
];

export function motionFor(index: number, zoom: number): Motion {
  const [fromX, fromY, toX, toY] = DRIFTS[index % DRIFTS.length];
  // Alternate in and out, so the film breathes rather than always pushing in.
  const zoomIn = index % 2 === 0;
  return {
    fromScale: zoomIn ? 1 : 1 + zoom,
    toScale: zoomIn ? 1 + zoom : 1,
    fromX,
    fromY,
    toX,
    toY,
  };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function planVideo(photoCount: number, lookId: LookId, trackId: TrackId): Plan {
  const look = LOOKS[lookId];
  const track = TRACKS[trackId];
  const beat = 60 / track.bpm;
  const F = look.fade;

  // The title holds for about three seconds, ending on a beat.
  const titleLead = Math.max(1, Math.round(3 / beat)) * beat;
  const T = titleLead + F;

  const minBeats = Math.max(1, Math.ceil((MIN_PHOTO_SECONDS - F) / beat - 1e-9));
  const maxBeats = Math.max(minBeats, Math.floor((MAX_PHOTO_SECONDS - F) / beat + 1e-9));
  let beats = Math.min(maxBeats, Math.max(minBeats, Math.round(look.step / beat)));

  const length = (n: number, b: number) => titleLead + n * b * beat + END_SECONDS;

  let used = Math.max(0, photoCount);
  // Quicker cuts first, down to two seconds a photo; then fewer photos.
  while (beats > minBeats && length(used, beats) > MAX_SECONDS) beats -= 1;
  while (used > 1 && length(used, beats) > MAX_SECONDS) used -= 1;

  const step = beats * beat;
  const P = step + F;
  const segments: Segment[] = [{ kind: "title", start: 0, end: round(T) }];
  for (let i = 0; i < used; i++) {
    const start = titleLead + i * step;
    segments.push({ kind: "photo", index: i, start: round(start), end: round(start + P), motion: motionFor(i, look.zoom) });
  }
  const endStart = titleLead + used * step;
  segments.push({ kind: "end", start: round(endStart), end: round(endStart + END_SECONDS) });

  return {
    look,
    track,
    segments,
    duration: round(endStart + END_SECONDS),
    photoSeconds: round(P),
    used,
    dropped: Math.max(0, photoCount - used),
  };
}

/** How visible a segment is at time t: 0 before it, rising over the fade
 * as it arrives, 1 while it holds. It never fades out -- the next one fades
 * in over it -- except the end card, which is last and stays. Smoothstep, so
 * a crossfade has no visible start or finish. */
export function opacityAt(seg: Segment, t: number, fade: number): number {
  if (t < seg.start || t > seg.end) return 0;
  if (seg.start === 0) return 1;
  const x = Math.min(1, (t - seg.start) / fade);
  return x * x * (3 - 2 * x);
}

/** How far through its own time on screen a segment is, 0 to 1. Linear: a
 * Ken Burns move is constant motion, and easing it would make every photo
 * stop dead in the middle of each crossfade. */
export function progressAt(seg: Segment, t: number): number {
  return Math.min(1, Math.max(0, (t - seg.start) / (seg.end - seg.start)));
}

/** The segments on screen at t, bottom first. */
export function segmentsAt(plan: Plan, t: number): Segment[] {
  return plan.segments.filter((s) => t >= s.start && t <= s.end);
}
