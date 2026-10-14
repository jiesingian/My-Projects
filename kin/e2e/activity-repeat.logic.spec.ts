import { test, expect } from "@playwright/test";
import { activityRRule, describeActivityRepeat, occurrenceDays, occurrenceStarts, occursOn, readRepeatFields } from "@/lib/activity-repeat";
import { buildBrief, type BriefItem } from "@/lib/brief";
import { buildIcs } from "@/lib/ics";

/** How a Planner task repeats (Janine, 14 October): the days a weekly one
 * falls on, the day it stops, and rows saved before either existed behaving
 * exactly as they did. 2026-10-12 is a Monday. */

test("a weekly task falls on the days chosen, and only those", () => {
  const rule = { repeat: "weekly", repeat_days: [1, 3, 5] };
  expect(occurrenceDays(rule, "2026-10-12", "2026-10-12", "2026-10-25")).toEqual([
    "2026-10-12", "2026-10-14", "2026-10-16",
    "2026-10-19", "2026-10-21", "2026-10-23",
  ]);
  expect(occursOn(rule, "2026-10-12", "2026-10-13")).toBe(false);
  // Nothing before the start, whatever the weekday.
  expect(occursOn(rule, "2026-10-12", "2026-10-09")).toBe(false);
});

test("an end date cuts the series off, and the end day itself still counts", () => {
  const rule = { repeat: "weekly", repeat_days: [1, 3, 5], repeat_until: "2026-10-21" };
  expect(occurrenceDays(rule, "2026-10-12", "2026-10-01", "2026-11-30")).toEqual(["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21"]);
  const monthly = { repeat: "monthly", repeat_until: "2027-01-14" };
  expect(occurrenceDays(monthly, "2026-10-15", "2026-10-01", "2027-03-31")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
});

test("rows saved before there were days or an end keep behaving exactly as before", () => {
  // Weekly with no days: the start's own weekday, every week, never ending.
  expect(occurrenceDays({ repeat: "weekly", repeat_days: null, repeat_until: null }, "2026-10-14", "2026-10-01", "2026-11-11")).toEqual([
    "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11",
  ]);
  // An empty list is the same as none.
  expect(occursOn({ repeat: "weekly", repeat_days: [] }, "2026-10-14", "2026-10-21")).toBe(true);
  // Once is its own day only; monthly on the date, yearly on the month and day.
  expect(occurrenceDays({ repeat: "once" }, "2026-10-14", "2026-10-01", "2026-12-31")).toEqual(["2026-10-14"]);
  expect(occursOn({ repeat: "yearly" }, "2025-10-14", "2026-10-14")).toBe(true);
  expect(occursOn({ repeat: "yearly" }, "2025-10-14", "2026-10-15")).toBe(false);
  // The calendar link still says just FREQ=WEEKLY for them.
  expect(activityRRule({ repeat: "weekly" }, new Date("2026-10-14T01:00:00Z"), "Asia/Manila")).toBe("RRULE:FREQ=WEEKLY");
  expect(activityRRule({ repeat: "once" }, new Date("2026-10-14T01:00:00Z"))).toBeNull();
});

test("across a month boundary: weekly days carry on, and the 31st skips a short month", () => {
  expect(occurrenceDays({ repeat: "weekly", repeat_days: [2, 6] }, "2026-10-27", "2026-10-26", "2026-11-08")).toEqual(["2026-10-27", "2026-10-31", "2026-11-03", "2026-11-07"]);
  expect(occurrenceDays({ repeat: "monthly" }, "2026-08-31", "2026-08-01", "2026-12-31")).toEqual(["2026-08-31", "2026-10-31", "2026-12-31"]);
});

test("each occurrence keeps the household's clock time, in the household's zone", () => {
  // 07:00 Monday in Manila is 23:00 Sunday in UTC; the days are Manila's.
  const start = new Date("2026-10-11T23:00:00Z");
  const manila = occurrenceStarts({ repeat: "weekly", repeat_days: [1, 3] }, start, "2026-10-12", "2026-10-18", "Asia/Manila");
  expect(manila.map((d) => d.toISOString())).toEqual(["2026-10-11T23:00:00.000Z", "2026-10-13T23:00:00.000Z"]);
  // New York changes its clocks on 1 November: 18:00 stays 18:00.
  const ny = occurrenceStarts({ repeat: "weekly", repeat_days: [6] }, new Date("2026-10-31T22:00:00Z"), "2026-10-31", "2026-11-07", "America/New_York");
  expect(ny.map((d) => d.toISOString())).toEqual(["2026-10-31T22:00:00.000Z", "2026-11-07T23:00:00.000Z"]);
});

test("the RRULE carries BYDAY and UNTIL, moved to UTC's days for the feed", () => {
  const start = new Date("2026-10-11T23:00:00Z"); // Mon 07:00 Manila
  const rule = { repeat: "weekly", repeat_days: [1, 3, 5], repeat_until: "2026-11-30" };
  // Google is told the zone and takes the days as they are; UNTIL is the end
  // of 30 November in Manila, in UTC.
  expect(activityRRule(rule, start, "Asia/Manila")).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261130T155959Z");
  // The feed's DTSTART is UTC, where Monday 07:00 is still Sunday.
  expect(activityRRule(rule, start, "Asia/Manila", { utcStart: true })).toBe("RRULE:FREQ=WEEKLY;BYDAY=SU,TU,TH;UNTIL=20261130T155959Z");
  // A morning start that is the same day in UTC is not moved.
  expect(activityRRule({ repeat: "weekly", repeat_days: [1] }, new Date("2026-10-12T02:00:00Z"), "Asia/Manila", { utcStart: true })).toBe("RRULE:FREQ=WEEKLY;BYDAY=MO");
});

test("the feed writes the rule into the event", () => {
  const ics = buildIcs("Kin", [
    { uid: "a-1", title: "Gym", starts_at: "2026-10-12T02:00:00Z", ends_at: null, all_day: null, all_day_end: null, yearly: false, repeat: "weekly", location: null, notes: null, repeat_days: [1, 3], repeat_until: "2026-12-31", time_zone: "Asia/Manila" },
  ], new Date("2026-10-14T00:00:00Z"));
  expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T155959Z");
});

test("the rule in words", () => {
  expect(describeActivityRepeat({ repeat: "weekly", repeat_days: [1, 3, 5], repeat_until: "2026-11-30" }, "2026-10-12")).toBe("Every Mon, Wed, Fri · until 30 Nov");
  expect(describeActivityRepeat({ repeat: "weekly" }, "2026-10-14")).toBe("Every Wed");
  expect(describeActivityRepeat({ repeat: "weekly", repeat_days: [0, 1, 2, 3, 4, 5, 6] }, "2026-10-14")).toBe("Every day");
  expect(describeActivityRepeat({ repeat: "monthly", repeat_until: "2027-03-01" }, "2026-10-02")).toBe("Every month on the 2nd · until 1 Mar 2027");
  expect(describeActivityRepeat({ repeat: "yearly" }, "2026-10-14")).toBe("Every year on 14 Oct");
  expect(describeActivityRepeat({ repeat: "once" }, "2026-10-14")).toBeNull();
});

test("what the form sends becomes the stored rule, or says what is wrong", () => {
  // Weekly from a Monday on Wed and Fri: it starts on the Wednesday, so
  // start_at is always a real occurrence.
  expect(readRepeatFields({ repeat: "weekly", days: ["5", "3"], until: "", date: "2026-10-12" })).toEqual({ repeat: "weekly", repeat_days: [3, 5], repeat_until: null, date: "2026-10-14" });
  expect(readRepeatFields({ repeat: "weekly", days: [], until: "", date: "2026-10-12" })).toEqual({ error: "Pick at least one day of the week." });
  expect(readRepeatFields({ repeat: "monthly", days: ["1"], until: "2026-10-01", date: "2026-10-12" })).toEqual({ error: "The end date is before the start." });
  expect(readRepeatFields({ repeat: "weekly", days: ["5"], until: "2026-10-13", date: "2026-10-12" })).toEqual({ error: "The end date comes before the first day it repeats." });
  expect(readRepeatFields({ repeat: "weekly", days: ["1"], until: "2026-02-30", date: "2026-10-12" })).toEqual({ error: "That end date isn't a real date." });
  // Once drops any days or end the form still had.
  expect(readRepeatFields({ repeat: "once", days: ["1"], until: "2026-12-01", date: "2026-10-12" })).toEqual({ repeat: "once", repeat_days: null, repeat_until: null, date: "2026-10-12" });
  // Anything unknown is once.
  expect(readRepeatFields({ repeat: "hourly", days: [], until: "", date: "2026-10-12" })).toEqual({ repeat: "once", repeat_days: null, repeat_until: null, date: "2026-10-12" });
});

test("the spoken brief reads a weekly task on its chosen days and not after its end", () => {
  const gym: BriefItem = { title: "Gym", starts_at: "2026-10-12T22:00:00Z", ends_at: null, all_day: null, all_day_end: null, yearly: false, repeat: "weekly", location: null, repeat_days: [2, 4], repeat_until: "2026-10-22" };
  // Tue 13 Oct 06:00 Manila is the first; Thu 15 Oct at 05:00 Manila, before it.
  expect(buildBrief("Ana", [gym], new Date("2026-10-14T21:00:00Z"), "Asia/Manila")).toContain("At 6 AM, Gym.");
  // Wednesday: not one of its days.
  expect(buildBrief("Ana", [gym], new Date("2026-10-13T21:00:00Z"), "Asia/Manila")).toContain("nothing on the calendar");
  // Tuesday 27 October: past its end.
  expect(buildBrief("Ana", [gym], new Date("2026-10-26T21:00:00Z"), "Asia/Manila")).toContain("nothing on the calendar");
});
