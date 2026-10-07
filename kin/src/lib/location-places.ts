/** Saved places and "who's where" (roadmap item 10, 20261007160000).
 *
 * Pure, so the rules are checkable without a phone: which saved place a
 * position is at, when a reading counts as an arrival, and the one line
 * Today shows for each person. */

export type SavedPlace = { id: string; name: string; lat: number; lng: number; radiusM: number; notify: boolean };

/** Metres between two points (haversine; plenty for a house-sized radius). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A reading vaguer than this says nothing about which building someone is
 * in, so it is never "at School" -- a guess would announce false arrivals. */
export const MAX_PLACE_ACCURACY_M = 500;

/** The saved place a reading is inside, nearest first; null when it is in
 * none of them or too vague to say. */
export function placeAt(lat: number, lng: number, places: SavedPlace[], accuracyM: number | null = null): SavedPlace | null {
  if (accuracyM !== null && accuracyM > MAX_PLACE_ACCURACY_M) return null;
  let best: { place: SavedPlace; d: number } | null = null;
  for (const place of places) {
    const d = distanceM({ lat, lng }, place);
    if (d <= place.radiusM && (!best || d < best.d)) best = { place, d };
  }
  return best?.place ?? null;
}

/** Whether a reading is an arrival worth telling the household: at a saved
 * place that wants notices, and not the place they were already at. */
export function arrivalAt(previousPlaceId: string | null, now: SavedPlace | null): SavedPlace | null {
  return now && now.notify && now.id !== previousPlaceId ? now : null;
}

export function isPaused(pausedUntil: string | null, now: Date = new Date()): boolean {
  return pausedUntil !== null && new Date(pausedUntil).getTime() > now.getTime();
}

/** The pause lengths offered, in hours ("until tomorrow" is worked out from
 * the household's clock by the caller). */
export const PAUSE_HOURS = [1, 3, 8] as const;

export type WhereInput = { sharing: boolean; lat: number | null; pausedUntil: string | null; placeName: string | null; updatedAt: string | null };

/** "At School", "Out", "Paused", or null for someone not sharing. The time
 * goes alongside, from the caller, in the household's zone. */
export function whereLabel(p: WhereInput, now: Date = new Date()): string | null {
  if (!p.sharing) return null;
  if (isPaused(p.pausedUntil, now)) return "Paused";
  if (p.lat === null) return "Waiting for a reading";
  return p.placeName ? `At ${p.placeName}` : "Out";
}
