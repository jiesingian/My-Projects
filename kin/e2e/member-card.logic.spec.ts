import { test, expect } from "@playwright/test";
import { apartLabel, audienceOf, cleanPosition, clockIn, dayIn, forPreview, isNightIn, isTimeZone, latest, offsetMinutes, ownSpendingAccounts, sectionsFor, sinceLabel, zoneCity } from "@/lib/member-card";

/** The member card on Today (30 September): who sees which part of whose
 * card, and the arithmetic of "3:40 pm in Dubai, 4 h behind you". */

const parent = { id: "p", role: "parent", kidView: false };
const adult = { id: "a", role: "adult", kidView: false };
const child = { id: "c", role: "child_self", kidView: false };
const kidView = { id: "k", role: "child_self", kidView: true };

test("who is looking", () => {
  expect(audienceOf(parent, "p")).toBe("self");
  expect(audienceOf(parent, "x")).toBe("grownup");
  expect(audienceOf(adult, "x")).toBe("grownup");
  expect(audienceOf(child, "x")).toBe("child");
  expect(audienceOf(kidView, "x")).toBe("child");
  // Kid view is a child whatever the role says.
  expect(audienceOf({ id: "q", role: "parent", kidView: true }, "x")).toBe("child");
});

test("money and medicines: grown-ups and yourself, never a child", () => {
  expect(sectionsFor("grownup")).toMatchObject({ money: true, care: true, actions: true });
  expect(sectionsFor("self")).toMatchObject({ money: true, care: true, actions: false });
  expect(sectionsFor("child")).toMatchObject({ money: false, care: false, now: true, today: true, actions: true });
});

test("a preview shows only what the household is shown", () => {
  const rows = [
    { id: 1, visibility: "family" },
    { id: 2, visibility: "private" },
    { id: 3, visibility: "parents" },
  ];
  expect(forPreview(rows).map((r) => r.id)).toEqual([1]);
});

test("spending counts the person's own accounts, not joint ones", () => {
  const accounts = [
    { id: "own", owner_member_id: "m", is_joint: false, is_private: false },
    { id: "secret", owner_member_id: "m", is_joint: false, is_private: true },
    { id: "joint", owner_member_id: "m", is_joint: true, is_private: false },
    { id: "theirs", owner_member_id: "z", is_joint: false, is_private: false },
  ];
  expect(ownSpendingAccounts(accounts, "m", false).map((a) => a.id)).toEqual(["own", "secret"]);
  expect(ownSpendingAccounts(accounts, "m", true).map((a) => a.id)).toEqual(["own"]);
});

test("time zones", () => {
  expect(isTimeZone("Asia/Dubai")).toBe(true);
  expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
  expect(isTimeZone("Not/AZone")).toBe(false);
  expect(isTimeZone("x; drop table")).toBe(false);
  expect(isTimeZone(42)).toBe(false);
  expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");

  const noon = new Date("2026-09-30T04:00:00Z"); // 12:00 in Manila, 08:00 in Dubai
  expect(offsetMinutes("Asia/Manila", noon)).toBe(480);
  expect(offsetMinutes("Asia/Dubai", noon)).toBe(240);
  expect(offsetMinutes("Asia/Kolkata", noon)).toBe(330);
  expect(offsetMinutes("UTC", noon)).toBe(0);
  expect(apartLabel("Asia/Dubai", "Asia/Manila", noon)).toBe("4 h behind you");
  expect(apartLabel("Asia/Manila", "Asia/Dubai", noon)).toBe("4 h ahead of you");
  expect(apartLabel("Asia/Kolkata", "Asia/Manila", noon)).toBe("2 h 30 min behind you");
  expect(apartLabel("Asia/Manila", "Asia/Manila", noon)).toBe("Same time as you");
  expect(clockIn("Asia/Dubai", noon)).toBe("8:00 am");
  expect(clockIn("Asia/Manila", noon)).toBe("12:00 pm");
  expect(isNightIn("Asia/Dubai", noon)).toBe(false);
  expect(isNightIn("America/New_York", noon)).toBe(true); // midnight there
  // The same instant is a different day on either side of the world.
  expect(dayIn("Asia/Manila", new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  expect(dayIn("America/Los_Angeles", new Date("2026-09-30T20:00:00Z"))).toBe("2026-09-30");
});

test("since and latest", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  expect(sinceLabel(null, now)).toBeNull();
  expect(sinceLabel("2026-09-30T11:59:40Z", now)).toBe("just now");
  expect(sinceLabel("2026-09-30T11:55:00Z", now)).toBe("5 min ago");
  expect(sinceLabel("2026-09-30T09:00:00Z", now)).toBe("3 h ago");
  expect(sinceLabel("2026-09-28T12:00:00Z", now)).toBe("2 d ago");
  expect(latest(null, "2026-09-30T01:00:00Z", undefined, "2026-09-29T23:00:00Z")).toBe("2026-09-30T01:00:00Z");
  expect(latest(null, undefined)).toBeNull();
});

test("an SOS position is real or it is nothing", () => {
  expect(cleanPosition(25.2, 55.27, 12.6)).toEqual({ lat: 25.2, lng: 55.27, accuracy_m: 13 });
  expect(cleanPosition(25.2, 55.27, null)).toEqual({ lat: 25.2, lng: 55.27, accuracy_m: null });
  expect(cleanPosition(91, 0, 5)).toBeNull();
  expect(cleanPosition(0, 181, 5)).toBeNull();
  expect(cleanPosition(Number.NaN, 0, 5)).toBeNull();
  expect(cleanPosition("25", 55, 5)).toBeNull();
  expect(cleanPosition(0, 0, -3)).toEqual({ lat: 0, lng: 0, accuracy_m: null });
});
