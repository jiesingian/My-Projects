import { test, expect } from "@playwright/test";
import { arrivedMessage, arrivedClock, mapLink, isRealPosition } from "@/lib/arrived";
import { goPath } from "@/lib/quick-button";
import type { SavedPlace } from "@/lib/location-places";

/** "Nakarating na ako" (19 October): one tap, one message to the household,
 * and nothing about where anybody was kept beyond it. */

const school: SavedPlace = { id: "s", name: "School", lat: 14.6507, lng: 121.0756, radiusM: 150, notify: true };
const lola: SavedPlace = { id: "l", name: "Lola's", lat: 14.5547, lng: 121.0244, radiusM: 150, notify: false };
// 7:12 in the morning, Manila (UTC+8).
const at = new Date("2026-10-19T23:12:00Z");

test("at a saved place, it names the place and the time", () => {
  const m = arrivedMessage({ first: "Lia", lat: 14.6508, lng: 121.0757, accuracyM: 20, places: [school, lola], at, tz: "Asia/Manila" });
  expect(m.body).toBe("Lia is at School, 7:12 AM");
  expect(m.title).toBe("Lia is at School");
  expect(m.place).toBe("School");
  // A place with its arrival notices off is still a place it can name: this
  // is a message somebody chose to send, not an automatic notice.
  expect(arrivedMessage({ first: "Lia", lat: lola.lat, lng: lola.lng, accuracyM: 10, places: [school, lola], at, tz: "Asia/Manila" }).place).toBe("Lola's");
});

test("anywhere else, or too vague to say, it sends a map link instead", () => {
  const m = arrivedMessage({ first: "Ben", lat: 14.6, lng: 121.1, accuracyM: 30, places: [school], at, tz: "Asia/Manila" });
  expect(m.body).toBe("Ben has arrived, 7:12 AM: https://maps.google.com/?q=14.60000,121.10000");
  expect(m.place).toBeNull();
  // Inside School's circle, but the reading is good to a kilometre: never a
  // confident "at School".
  expect(arrivedMessage({ first: "Ben", lat: school.lat, lng: school.lng, accuracyM: 1000, places: [school], at, tz: "Asia/Manila" }).place).toBeNull();
  expect(arrivedMessage({ first: "Ben", lat: 14.6, lng: 121.1, accuracyM: null, places: [], at, tz: "Asia/Manila" }).body).toContain("maps.google.com");
});

test("the clock is twelve-hour in the household's zone, the pin about a metre", () => {
  expect(arrivedClock(at, "Asia/Manila")).toBe("7:12 AM");
  expect(arrivedClock(new Date("2026-10-19T09:05:00Z"), "Asia/Manila")).toBe("5:05 PM");
  expect(mapLink(14.123456789, -121.987654321)).toBe("https://maps.google.com/?q=14.12346,-121.98765");
});

test("only a real position is sent", () => {
  expect(isRealPosition(14.6, 121)).toBe(true);
  expect(isRealPosition(91, 0)).toBe(false);
  expect(isRealPosition(0, -181)).toBe(false);
  expect(isRealPosition(Number.NaN, 0)).toBe(false);
});

test("the Action Button's Nakarating na ako lands on Today, kid view included", () => {
  expect(goPath("arrived", false)).toBe("/today?arrived=1");
  expect(goPath("arrived", true)).toBe("/today?arrived=1");
});
