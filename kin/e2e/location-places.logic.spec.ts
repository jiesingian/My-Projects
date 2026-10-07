import { test, expect } from "@playwright/test";
import { distanceM, placeAt, arrivalAt, isPaused, whereLabel, type SavedPlace } from "@/lib/location-places";

/** Saved places and "who's where" (lib/location-places, roadmap item 10). */

const home: SavedPlace = { id: "h", name: "Home", lat: 14.5995, lng: 120.9842, radiusM: 150, notify: true };
const school: SavedPlace = { id: "s", name: "School", lat: 14.6091, lng: 121.0223, radiusM: 200, notify: true };
const work: SavedPlace = { id: "w", name: "Work", lat: 14.5547, lng: 121.0244, radiusM: 150, notify: false };
const places = [home, school, work];

test("distance is in metres and about right", () => {
  expect(distanceM(home, home)).toBe(0);
  const d = distanceM(home, school); // Manila to Quezon City side: ~4.2 km
  expect(d).toBeGreaterThan(4000);
  expect(d).toBeLessThan(4500);
});

test("a reading inside a place's radius is at that place; outside every one is nowhere", () => {
  expect(placeAt(14.5996, 120.9843, places)?.name).toBe("Home");
  expect(placeAt(14.6090, 121.0222, places)?.name).toBe("School");
  expect(placeAt(14.58, 121.0, places)).toBeNull();
});

test("a vague reading is never placed, so it cannot announce a false arrival", () => {
  expect(placeAt(14.5996, 120.9843, places, 30)?.name).toBe("Home");
  expect(placeAt(14.5996, 120.9843, places, 2000)).toBeNull();
});

test("an arrival is a new place that wants notices, once", () => {
  expect(arrivalAt(null, school)?.name).toBe("School");
  expect(arrivalAt("h", school)?.name).toBe("School");
  expect(arrivalAt("s", school), "already there: not again").toBeNull();
  expect(arrivalAt("h", work), "a place with notices off").toBeNull();
  expect(arrivalAt("s", null), "leaving is not announced").toBeNull();
});

test("Today's line: at a place, out, paused, or nothing for someone not sharing", () => {
  const now = new Date("2026-10-07T10:00:00Z");
  const base = { sharing: true, lat: 14.6, pausedUntil: null, placeName: null, updatedAt: "2026-10-07T09:55:00Z" };
  expect(whereLabel({ ...base, placeName: "School" }, now)).toBe("At School");
  expect(whereLabel(base, now)).toBe("Out");
  expect(whereLabel({ ...base, lat: null, pausedUntil: "2026-10-07T11:00:00Z" }, now)).toBe("Paused");
  expect(whereLabel({ ...base, pausedUntil: "2026-10-07T09:00:00Z" }, now), "a pause that has ended").toBe("Out");
  expect(whereLabel({ ...base, sharing: false }, now)).toBeNull();
  expect(isPaused(null, now)).toBe(false);
});
