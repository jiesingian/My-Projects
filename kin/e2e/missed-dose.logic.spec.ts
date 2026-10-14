import { test, expect } from "@playwright/test";
import { alertLine, canBeTold, delayWords, missedAlertAt, missedAlertDue, missedTitle, time12 } from "@/lib/missed-dose";

// "Tell someone if a dose is missed" (20261014200000). The job does this sum
// in SQL; supabase/tests/pglite/probes/missed-dose-alerts.mjs runs that one.

const since = new Date("2026-10-13T00:00:00+08:00");
const base = { delayMinutes: 60, tz: "Asia/Manila", activeSince: since, taken: false };

test("an 08:00 dose in Manila, an hour late, is reported at 09:00 Manila", () => {
  expect(missedAlertAt("2026-10-14", "08:00", 60, "Asia/Manila")?.toISOString()).toBe("2026-10-14T01:00:00.000Z");
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: new Date("2026-10-14T00:59:00Z") })).toBe(false);
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: new Date("2026-10-14T01:00:00Z") })).toBe(true);
});

test("around midnight: a 23:30 dose an hour late falls due at 00:30 the next day, still the day before's dose", () => {
  expect(missedAlertAt("2026-10-14", "23:30", 60, "Asia/Manila")?.toISOString()).toBe("2026-10-14T16:30:00.000Z");
  // 00:30 on the 15th in Manila.
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "23:30", now: new Date("2026-10-14T16:30:00Z") })).toBe(true);
  // The same instant is not the 15th's 23:30 dose.
  expect(missedAlertDue({ ...base, day: "2026-10-15", time: "23:30", now: new Date("2026-10-14T16:30:00Z") })).toBe(false);
  // Half an hour: 23:45 plus 30 minutes is 00:15.
  expect(missedAlertAt("2026-10-14", "23:45", 30, "Asia/Manila")?.toISOString()).toBe("2026-10-14T16:15:00.000Z");
});

test("the household's own zone, not the server's", () => {
  // 09:00 on 17 October in Los Angeles (PDT, UTC-7).
  expect(missedAlertAt("2026-10-17", "08:00", 60, "America/Los_Angeles")?.toISOString()).toBe("2026-10-17T16:00:00.000Z");
  const la = { ...base, tz: "America/Los_Angeles", day: "2026-10-17", time: "08:00" };
  expect(missedAlertDue({ ...la, now: new Date("2026-10-17T01:00:00Z") })).toBe(false);
  expect(missedAlertDue({ ...la, now: new Date("2026-10-17T16:00:00Z") })).toBe(true);
});

test("ticked, stale, or from before it was turned on: not reported", () => {
  const at = new Date("2026-10-14T01:00:00Z");
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: at, taken: true })).toBe(false);
  // Three hours after it fell due is too late to be news.
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: new Date("2026-10-14T04:00:00Z") })).toBe(false);
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: new Date("2026-10-14T03:59:00Z") })).toBe(true);
  // Turned on at 08:30: the 08:00 dose that morning is never reported.
  expect(missedAlertDue({ ...base, day: "2026-10-14", time: "08:00", now: at, activeSince: new Date("2026-10-14T08:30:00+08:00") })).toBe(false);
});

test("the words: on the card and in the push", () => {
  expect(alertLine("Ben", 60)).toBe("Ben is told if a dose is late by an hour");
  expect(alertLine("Ben", 30)).toBe("Ben is told if a dose is late by half an hour");
  expect(delayWords(120)).toBe("two hours");
  expect(time12("08:00")).toBe("8:00 AM");
  expect(time12("00:15")).toBe("12:15 AM");
  expect(time12("12:00")).toBe("12:00 PM");
  expect(time12("20:30")).toBe("8:30 PM");
  expect(missedTitle("Lola", "female", "08:00", "Losartan")).toBe("Lola hasn't taken her 8:00 AM Losartan");
  expect(missedTitle("Lolo", "male", "20:00", "Metformin")).toBe("Lolo hasn't taken his 8:00 PM Metformin");
  expect(missedTitle("Ate", null, "08:00", "Losartan")).toBe("Ate's 8:00 AM Losartan isn't ticked");
});

test("who can be told: a grown-up with a login who could see the medicine anyway", () => {
  const med = { member_id: "lola", visibility: "family", created_by: "ann" };
  expect(canBeTold({ id: "ben", role: "adult", hasLogin: true }, med)).toBe(true);
  expect(canBeTold({ id: "ben", role: "adult", hasLogin: false }, med)).toBe(false);
  expect(canBeTold({ id: "kid", role: "child_self", hasLogin: true }, med)).toBe(false);
  expect(canBeTold({ id: "lola", role: "adult", hasLogin: true }, med)).toBe(false);
  expect(canBeTold({ id: "ben", role: "adult", hasLogin: true }, { ...med, visibility: "parents" })).toBe(false);
  expect(canBeTold({ id: "ben", role: "parent", hasLogin: true }, { ...med, visibility: "parents" })).toBe(true);
  expect(canBeTold({ id: "ben", role: "parent", hasLogin: true }, { ...med, visibility: "private" })).toBe(false);
  expect(canBeTold({ id: "ann", role: "parent", hasLogin: true }, { ...med, visibility: "private" })).toBe(true);
});
