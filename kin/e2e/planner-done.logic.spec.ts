import { test, expect } from "@playwright/test";
import { eventIsCurrent, eventIsOver, eventMatches, eventWhen, goalIsFinished, showsDone } from "@/lib/planner-done";

/** Completed plans are folded away on the Planner by default. An event is
 * over once its last day has gone; a yearly one never is. A goal is finished
 * only when it is a reached one-off target with nothing left owed on it. */

const today = "2026-10-12";

test("an event is over the day after it, not on the day", () => {
  expect(eventIsOver({ event_date: "2026-10-10" }, today)).toBe(true);
  expect(eventIsOver({ event_date: "2026-10-12" }, today)).toBe(false);
  expect(eventIsOver({ event_date: "2026-10-16" }, today)).toBe(false);
});

test("a multi-day event stays until its end date has passed", () => {
  expect(eventIsOver({ event_date: "2026-10-09", end_date: "2026-10-12" }, today)).toBe(false);
  expect(eventIsOver({ event_date: "2026-10-09", end_date: "2026-10-11" }, today)).toBe(true);
  expect(eventIsOver({ event_date: "2027-01-22", end_date: "2027-01-26" }, today)).toBe(false);
  // An end date before the start (bad data) falls back to the start.
  expect(eventIsOver({ event_date: "2026-10-13", end_date: "2026-10-01" }, today)).toBe(false);
  expect(eventIsOver({ event_date: "2026-10-01", end_date: null }, today)).toBe(true);
});

test("a yearly event is never over", () => {
  expect(eventIsOver({ event_date: "1990-09-25", recurs_yearly: true }, today)).toBe(false);
  expect(eventIsOver({ event_date: "2026-09-25", recurs_yearly: false }, today)).toBe(true);
});

test("a goal is finished only when reached, one-off, and settled", () => {
  expect(goalIsFinished({ period: "total", reached: true, reward: null })).toBe(true);
  expect(goalIsFinished({ period: "total", reached: false, reward: null })).toBe(false);
  // Periodic goals start again.
  for (const period of ["day", "week", "month"]) expect(goalIsFinished({ period, reached: true, reward: null })).toBe(false);
  // A reward still owed keeps it in view.
  for (const status of ["pending", "approved", "claimed", "given"]) expect(goalIsFinished({ period: "total", reached: true, reward: { status } })).toBe(false);
  for (const status of ["received", "refused"]) expect(goalIsFinished({ period: "total", reached: true, reward: { status } })).toBe(true);
});

test("completed things are hidden unless done=1", () => {
  expect(showsDone(undefined)).toBe(false);
  expect(showsDone("")).toBe(false);
  expect(showsDone("0")).toBe(false);
  expect(showsDone("1")).toBe(true);
});

test("When: upcoming includes what is on today, current is only today, past is over", () => {
  const trip = { event_date: "2026-10-10", end_date: "2026-10-14" };
  const fieldtrip = { event_date: "2026-10-01" };
  const scienceWeek = { event_date: "2026-10-16" };
  const today_ = { event_date: "2026-10-12" };
  const birthday = { event_date: "1990-10-12", recurs_yearly: true };
  const otherBirthday = { event_date: "1990-09-25", recurs_yearly: true };

  expect([trip, fieldtrip, scienceWeek, today_, birthday, otherBirthday].map((e) => eventMatches(e, "upcoming", today))).toEqual([true, false, true, true, true, true]);
  expect([trip, fieldtrip, scienceWeek, today_, birthday, otherBirthday].map((e) => eventMatches(e, "current", today))).toEqual([true, false, false, true, true, false]);
  expect([trip, fieldtrip, scienceWeek, today_, birthday, otherBirthday].map((e) => eventMatches(e, "past", today))).toEqual([false, true, false, false, false, false]);
  expect(eventIsCurrent({ event_date: "2026-10-12", end_date: "2026-10-01" }, today)).toBe(true);
});

test("When param: upcoming unless it names another", () => {
  expect(eventWhen(undefined)).toBe("upcoming");
  expect(eventWhen("nonsense")).toBe("upcoming");
  expect(eventWhen("current")).toBe("current");
  expect(eventWhen("past")).toBe("past");
});
