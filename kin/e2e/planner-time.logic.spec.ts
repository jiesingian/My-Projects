import { test, expect } from "@playwright/test";
import { activityInstants } from "@/lib/planner-time";

/** The two instants an activity is made of.
 *
 * The Planner built these by hand -- new Date(`${date}T${from}`) -- which is
 * the pattern lib/time.ts exists to replace, and both of its failure modes
 * were measured on this form on 9 September:
 *
 *   2026-09-31 09:00  ->  1 October, silently, nothing anywhere said so
 *   2026-02-30 09:00  ->  2 March, likewise
 *   2026-09-15 25:00  ->  Invalid Date, and .toISOString() then throws
 *
 * familyInstant was written for exactly this and applied to the assistant's
 * tools, where a model composes the same strings. The form a person uses was
 * left alone, so the AI path was careful and the human one was not.
 */

const ok = (r: ReturnType<typeof activityInstants>) => {
  if ("error" in r) throw new Error(`expected instants, got: ${r.error}`);
  return r;
};

test("a day that does not exist is refused, not rolled into the next month", () => {
  // The worse of the two: people do type the 31st of a thirty-day month, and
  // the old code filed the activity on a different day without a word.
  expect(activityInstants("2026-09-31", "09:00", "")).toHaveProperty("error");
  expect(activityInstants("2026-02-30", "09:00", "")).toHaveProperty("error");
});

test("a time that does not exist is refused rather than thrown", () => {
  // This one did surface -- as a RangeError out of the action, which the
  // member saw as "that didn't go through" with nothing to change.
  expect(activityInstants("2026-09-15", "25:00", "")).toHaveProperty("error");
  expect(activityInstants("2026-09-15", "09:61", "")).toHaveProperty("error");
});

test("an ordinary activity comes back as two instants", () => {
  const r = ok(activityInstants("2026-09-15", "09:00", "10:30"));
  expect(r.endAt).not.toBeNull();
  expect(r.endAt!.getTime() - r.startAt.getTime(), "an hour and a half apart").toBe(90 * 60 * 1000);
});

test("no end time is allowed, and is not an error", () => {
  const r = ok(activityInstants("2026-09-15", "09:00", ""));
  expect(r.endAt).toBeNull();
});

test("a blank start time falls back to nine in the morning", () => {
  const withBlank = ok(activityInstants("2026-09-15", "", ""));
  const withNine = ok(activityInstants("2026-09-15", "09:00", ""));
  expect(withBlank.startAt.getTime()).toBe(withNine.startAt.getTime());
});

test("an activity cannot end before it starts", () => {
  // Nothing in the database refuses this -- activities has no such CHECK --
  // and it renders as a negative span wherever a duration is shown.
  expect(activityInstants("2026-09-15", "10:00", "09:00")).toHaveProperty("error");
  // Equal is allowed: a zero-length activity is a moment, not a mistake.
  expect(activityInstants("2026-09-15", "10:00", "10:00")).not.toHaveProperty("error");
});

test("the instants are the household's clock, not the server's", () => {
  // 09:00 in Manila is 01:00 UTC. If this ever reads 09:00 UTC, the zone has
  // been inherited from the process again and the Planner is eight hours out.
  const r = ok(activityInstants("2026-09-15", "09:00", ""));
  expect(r.startAt.toISOString()).toBe("2026-09-15T01:00:00.000Z");
});
