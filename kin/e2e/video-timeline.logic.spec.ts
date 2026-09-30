import { test, expect } from "@playwright/test";
import { LOOKS, TRACKS, MAX_SECONDS, MIN_PHOTO_SECONDS, MAX_PHOTO_SECONDS, planVideo, opacityAt, segmentsAt, type LookId, type TrackId } from "@/lib/video-maker/timeline";

/** The plan behind a video made from an entry's photos (Jonathan, 30
 * September): a title card, 2-4 seconds a photo with crossfades, an end
 * card, cuts on the beat, and never longer than a minute. */

const looks = Object.keys(LOOKS) as LookId[];
const tracks = Object.keys(TRACKS) as TrackId[];

test("every look and tune keeps a photo on screen 2 to 4 seconds", () => {
  for (const look of looks)
    for (const track of tracks)
      for (const n of [1, 3, 8, 20, 40, 80]) {
        const plan = planVideo(n, look, track);
        expect(plan.photoSeconds, `${look}/${track}/${n}`).toBeGreaterThanOrEqual(MIN_PHOTO_SECONDS - 1e-6);
        expect(plan.photoSeconds, `${look}/${track}/${n}`).toBeLessThanOrEqual(MAX_PHOTO_SECONDS + 1e-6);
      }
});

test("never longer than a minute: quicker cuts first, then fewer photos", () => {
  const few = planVideo(8, "warm", "gentle");
  expect(few.duration).toBeLessThanOrEqual(MAX_SECONDS);
  expect(few.dropped).toBe(0);

  const many = planVideo(40, "warm", "gentle");
  expect(many.duration).toBeLessThanOrEqual(MAX_SECONDS);
  // A long list quickens the cuts before it leaves anything out.
  expect(many.photoSeconds).toBeLessThan(few.photoSeconds);

  const lots = planVideo(200, "lively", "bright");
  expect(lots.duration).toBeLessThanOrEqual(MAX_SECONDS);
  expect(lots.used + lots.dropped).toBe(200);
  expect(lots.used).toBeGreaterThan(20);
});

test("title first, every chosen photo in order, end card last", () => {
  const plan = planVideo(5, "classic", "waltz");
  expect(plan.segments.map((s) => s.kind)).toEqual(["title", "photo", "photo", "photo", "photo", "photo", "end"]);
  const indexes = plan.segments.flatMap((s) => (s.kind === "photo" ? [s.index] : []));
  expect(indexes).toEqual([0, 1, 2, 3, 4]);
  expect(plan.segments.at(-1)!.end).toBe(plan.duration);
});

test("each photo arrives on a beat of its tune", () => {
  for (const look of looks) {
    const plan = planVideo(6, look, LOOKS[look].track);
    const beat = 60 / plan.track.bpm;
    for (const s of plan.segments.slice(1)) {
      const beats = s.start / beat;
      expect(Math.abs(beats - Math.round(beats)), `${look} at ${s.start}s`).toBeLessThan(0.01);
    }
  }
});

test("neighbours overlap by exactly one crossfade, so the screen is never empty", () => {
  const plan = planVideo(6, "warm", "none");
  for (let i = 1; i < plan.segments.length; i++) {
    expect(plan.segments[i - 1].end - plan.segments[i].start).toBeCloseTo(plan.look.fade, 3);
  }
  for (let t = 0; t <= plan.duration; t += 0.05) {
    const covered = segmentsAt(plan, t).some((s) => opacityAt(s, t, plan.look.fade) > 0 || s.start === 0 || t >= s.start + plan.look.fade);
    expect(covered, `at ${t.toFixed(2)}s`).toBe(true);
  }
});

test("a crossfade rises smoothly from nothing to full", () => {
  const plan = planVideo(3, "warm", "gentle");
  const photo = plan.segments[1];
  const F = plan.look.fade;
  expect(opacityAt(photo, photo.start, F)).toBe(0);
  expect(opacityAt(photo, photo.start + F / 2, F)).toBeCloseTo(0.5, 5);
  expect(opacityAt(photo, photo.start + F, F)).toBe(1);
  // The title is there from the very first frame.
  expect(opacityAt(plan.segments[0], 0, F)).toBe(1);
});

test("neighbouring photos move differently", () => {
  const plan = planVideo(6, "lively", "bright");
  const moves = plan.segments.flatMap((s) => (s.kind === "photo" ? [s.motion] : []));
  for (let i = 1; i < moves.length; i++) {
    expect(moves[i]).not.toEqual(moves[i - 1]);
    // In, then out, then in: the film breathes.
    expect(moves[i].toScale > moves[i].fromScale).not.toBe(moves[i - 1].toScale > moves[i - 1].fromScale);
  }
});
