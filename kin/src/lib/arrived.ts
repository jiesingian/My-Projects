import { placeAt, type SavedPlace } from "@/lib/location-places";

/** "Nakarating na ako" (19 October): one deliberate tap that tells the
 * household "Lia is at School, 7:12 AM".
 *
 * The phone reads where it is once, at the tap, and the household gets a
 * message in the family chat and an arrival push. The spot is the nearest
 * saved place the reading is inside (the same rule as Who's where), or else
 * a map link, since "near the corner of Katipunan" is something only a map
 * says well. Nothing else is kept: no row in member_locations, no history,
 * no place id. The message is the whole record, and its sender can unsend
 * it like any other. That is Kin's no-location-trail rule, and the reason
 * this works without sharing being switched on: it is a message somebody
 * chose to send, not a position somebody is tracking. */

/** "7:12 AM", in the household's zone. Spoken Manila time is twelve-hour,
 * whatever the rest of Kin's clocks use. */
export function arrivedClock(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(at);
}

/** A map pin for a spot that is no saved place. Five decimals is about a
 * metre: as close as a phone reads, and no closer. */
export function mapLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function isRealPosition(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** What the household is told. `place` is the saved place it was read at,
 * if any (placeAt, which also refuses a reading too vague to say). */
export function arrivedMessage(input: {
  first: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  places: SavedPlace[];
  at: Date;
  tz: string;
}): { body: string; title: string; place: string | null } {
  const place = placeAt(input.lat, input.lng, input.places, input.accuracyM);
  const clock = arrivedClock(input.at, input.tz);
  if (place) return { body: `${input.first} is at ${place.name}, ${clock}`, title: `${input.first} is at ${place.name}`, place: place.name };
  return { body: `${input.first} has arrived, ${clock}: ${mapLink(input.lat, input.lng)}`, title: `${input.first} has arrived`, place: null };
}
