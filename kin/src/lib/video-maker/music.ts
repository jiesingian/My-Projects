/** Kin's three tunes for its videos, written here as code and played by the
 * browser's own synthesiser (Web Audio). Nothing is downloaded and nothing is
 * licensed from anyone: they were composed for Kin on 30 September 2026 and
 * are dedicated to the public domain under CC0 1.0
 * (https://creativecommons.org/publicdomain/zero/1.0/). Anyone may use them
 * for anything.
 *
 * Each is a short chord progression that loops for as long as the video
 * runs, rendered ahead of time into an AudioBuffer by an OfflineAudioContext
 * -- a minute renders in well under a second on a phone -- and then played
 * into the recording in step with the pictures. It fades in over a moment and
 * out over the end card. */

import { TRACKS, type TrackId } from "@/lib/video-maker/timeline";

type Ctx = BaseAudioContext;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** A chord: its root (MIDI note) and the intervals above it. */
type Chord = { root: number; tones: number[] };
const maj = (root: number): Chord => ({ root, tones: [0, 4, 7] });
const min = (root: number): Chord => ({ root, tones: [0, 3, 7] });

function envGain(ctx: Ctx, dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

/** A soft felt piano: a triangle with a quieter octave, filtered, struck and
 * left to ring. */
function piano(ctx: Ctx, dest: AudioNode, t: number, note: number, vel: number, ring = 2.2) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800 + vel * 1400;
  const g = envGain(ctx, dest, t, 0.22 * vel, 0.006, ring);
  lp.connect(g);
  for (const [mult, amp, type] of [
    [1, 1, "triangle"],
    [2, 0.25, "sine"],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midi(note) * mult;
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + ring + 0.1);
  }
}

/** A music box tine: a sine with two inharmonic partials that die away first. */
function bell(ctx: Ctx, dest: AudioNode, t: number, note: number, vel: number) {
  for (const [mult, amp, decay] of [
    [1, 1, 1.6],
    [2.76, 0.28, 0.6],
    [5.4, 0.1, 0.25],
  ]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = midi(note) * mult;
    o.connect(envGain(ctx, dest, t, 0.13 * vel * amp, 0.003, decay));
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}

/** A plucked string for the quicker tune. */
function pluck(ctx: Ctx, dest: AudioNode, t: number, note: number, vel: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(4200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
  lp.connect(envGain(ctx, dest, t, 0.16 * vel, 0.004, 0.42));
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = midi(note);
  o.connect(lp);
  o.start(t);
  o.stop(t + 0.5);
}

/** A warm pad under a whole chord: two slightly detuned saws per note, well
 * filtered, swelling in and out. */
function pad(ctx: Ctx, dest: AudioNode, t: number, notes: number[], length: number, level: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 850;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.9, length / 2));
  g.gain.setValueAtTime(level, t + Math.max(length - 0.6, length / 2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + length + 0.5);
  lp.connect(g).connect(dest);
  for (const n of notes) {
    for (const cents of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = midi(n);
      o.detune.value = cents;
      const og = ctx.createGain();
      og.gain.value = 0.5 / notes.length;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + length + 0.6);
    }
  }
}

function bass(ctx: Ctx, dest: AudioNode, t: number, note: number, length: number, vel = 1) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = midi(note);
  o.connect(envGain(ctx, dest, t, 0.28 * vel, 0.01, length));
  o.start(t);
  o.stop(t + length + 0.1);
}

function kick(ctx: Ctx, dest: AudioNode, t: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  o.connect(envGain(ctx, dest, t, 0.32, 0.004, 0.28));
  o.start(t);
  o.stop(t + 0.35);
}

function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A fixed seed: the same tune every time it is made.
  let s = 1234567;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

function shaker(ctx: Ctx, dest: AudioNode, t: number, noise: AudioBuffer, vel: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  src.connect(hp).connect(envGain(ctx, dest, t, 0.05 * vel, 0.003, 0.06));
  // Somewhere different in the noise each time, but the same every time the tune is made.
  src.start(t, (t * 0.37) % 0.8, 0.12);
}

/** A room for the notes to ring in: a convolver fed a decaying burst of noise. */
function room(ctx: Ctx, seconds: number): ConvolverNode {
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * seconds);
  const ir = ctx.createBuffer(2, len, rate);
  let s = 42;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((s / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 3);
    }
  }
  const c = ctx.createConvolver();
  c.buffer = ir;
  return c;
}

type Score = (ctx: Ctx, dry: AudioNode, wet: AudioNode, length: number) => void;

/** Gentle piano, 72 bpm, D major: D, A, B minor, G, a bar each, broken into
 * slow arpeggios over a pad, with a high note to open every second bar. */
const gentle: Score = (ctx, dry, wet, length) => {
  const beat = 60 / TRACKS.gentle.bpm;
  const bar = beat * 4;
  const chords = [maj(62), maj(57), min(59), maj(55)];
  const pattern = [0, 7, 12, 16, 19, 16, 12, 7];
  for (let b = 0, t = 0; t < length; b++, t += bar) {
    const c = chords[b % chords.length];
    const third = c.tones[1];
    pad(ctx, wet, t, [c.root - 12, c.root + third, c.root + 7], bar, 0.05);
    bass(ctx, dry, t, c.root - 24, bar * 0.9, 0.7);
    pattern.forEach((step, i) => {
      const n = c.root + (step === 16 ? third + 12 : step);
      piano(ctx, i % 2 ? wet : dry, t + i * (beat / 2), n, i === 0 ? 0.9 : 0.55 + (i % 3) * 0.08);
    });
    if (b % 2 === 0) piano(ctx, wet, t, c.root + 24 + (b % 4 === 0 ? 7 : third), 0.5, 3);
  }
};

/** Music box waltz, 90 bpm in three, F major: F, D minor, G minor, C, a bar
 * each -- bass on the one, the chord on two and three, a tune on top. */
const waltz: Score = (ctx, dry, wet, length) => {
  const beat = 60 / TRACKS.waltz.bpm;
  const bar = beat * 3;
  const chords = [maj(65), min(62), min(67), maj(60)];
  // The tune, one bar per chord, as steps above the chord's root.
  const tune = [
    [12, 16, 19],
    [15, 12, 7],
    [15, 19, 22],
    [16, 12, 11],
  ];
  for (let b = 0, t = 0; t < length; b++, t += bar) {
    const c = chords[b % chords.length];
    pad(ctx, wet, t, [c.root - 12 + c.tones[1], c.root - 12 + 7], bar, 0.035);
    bass(ctx, dry, t, c.root - 24, beat * 1.4, 0.8);
    for (const k of [1, 2]) for (const tone of c.tones) bell(ctx, wet, t + k * beat, c.root + tone, 0.28);
    // The tune rests every fourth bar so it breathes.
    if (b % 4 !== 3) tune[b % tune.length].forEach((s, i) => bell(ctx, dry, t + i * beat, c.root + s, i === 0 ? 0.85 : 0.65));
  }
};

/** Bright day, 116 bpm, G major: G, D, E minor, C -- plucked eighths, a
 * light kick on one and three, a shaker on the offbeats. */
const bright: Score = (ctx, dry, wet, length) => {
  const beat = 60 / TRACKS.bright.bpm;
  const bar = beat * 4;
  const chords = [maj(67), maj(62), min(64), maj(60)];
  const noise = noiseBuffer(ctx, 1);
  const pattern = [0, 7, 12, 7, 16, 7, 12, 19];
  for (let b = 0, t = 0; t < length; b++, t += bar) {
    const c = chords[b % chords.length];
    pad(ctx, wet, t, [c.root - 12, c.root - 12 + c.tones[1], c.root - 5], bar, 0.04);
    for (let i = 0; i < 8; i++) {
      const s = pattern[i];
      const n = c.root + (s === 16 ? c.tones[1] + 12 : s);
      pluck(ctx, i % 2 ? wet : dry, t + i * (beat / 2), n, i % 2 ? 0.6 : 0.9);
      if (i % 2) shaker(ctx, dry, t + i * (beat / 2), noise, 0.8);
    }
    for (const k of [0, 2]) kick(ctx, dry, t + k * beat);
    for (const k of [0, 1.5, 2, 3.5]) bass(ctx, dry, t + k * beat, c.root - 24, beat * 0.45, 0.9);
  }
};

const SCORES: Record<Exclude<TrackId, "none">, Score> = { gentle, waltz, bright };

/** Renders a tune to exactly `seconds`, faded in and out, as a buffer ready to play. */
export async function renderTrack(track: TrackId, seconds: number): Promise<AudioBuffer | null> {
  if (track === "none") return null;
  const Offline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) return null;
  const rate = 44100;
  const ctx = new Offline(2, Math.ceil(rate * seconds), rate);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.exponentialRampToValueAtTime(0.9, 0.4);
  const fadeFrom = Math.max(0.5, seconds - 2.5);
  master.gain.setValueAtTime(0.9, fadeFrom);
  master.gain.linearRampToValueAtTime(0.0001, seconds);
  // A gentle limiter, so three voices landing together never clip.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);

  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  dry.connect(master);
  const reverb = room(ctx, 2.4);
  const wetIn = ctx.createGain();
  wetIn.gain.value = 0.9;
  const wetOut = ctx.createGain();
  wetOut.gain.value = 0.35;
  wetIn.connect(reverb).connect(wetOut).connect(master);
  // The "wet" voices are heard dry as well, the reverb only adding the room.
  wetIn.connect(dry);

  SCORES[track](ctx, dry, wetIn, seconds);
  return ctx.startRendering();
}
