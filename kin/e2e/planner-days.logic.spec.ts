import { test, expect } from "@playwright/test";
import {
  bucketByDay,
  countsByMonth,
  dayAfterMonths,
  dayColumnOf,
  dayHeading,
  daysFrom,
  isPastDay,
  monthLong,
  monthsAround,
  monthShort,
  sameDayIn,
  weekLabel,
  weekStartDay,
} from "@/lib/planner-days";
import { familyDay, familyInstant, familyMidnight } from "@/lib/time";
import { occurrenceStarts } from "@/lib/activity-repeat";
import { expandRoutine, parseISODate, toISODate } from "@/lib/routines";

/** The Planner lays its calendar out in household days, whatever clock the
 * server runs on (19 October; docs/KNOWN_RISKS.md). Every test here runs
 * under process zones that are not Manila -- Node reads TZ afresh when it is
 * changed -- and must give the same answer under each. */

const ZONES = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Manila"];
const MANILA = "Asia/Manila";

function underEachZone(fn: () => void) {
  const was = process.env.TZ;
  try {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      fn();
    }
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

test("the process zone really does change under the test (or nothing here proves anything)", () => {
  const was = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  const la = new Date("2026-10-19T00:00:00Z").getTimezoneOffset();
  process.env.TZ = "Pacific/Kiritimati";
  const kiri = new Date("2026-10-19T00:00:00Z").getTimezoneOffset();
  if (was === undefined) delete process.env.TZ;
  else process.env.TZ = was;
  expect(la).toBe(420);
  expect(kiri).toBe(-840);
});

test("a 7:00 Monday task in Manila is filed under Monday, on any server", () => {
  underEachZone(() => {
    // 7:00 Monday 19 October in Manila is 23:00 Sunday in UTC.
    const at = familyInstant("2026-10-19", "07:00", MANILA)!;
    expect(at.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    const items = [{ id: "school", day: familyDay(at, MANILA) }, { id: "bill", day: "2026-10-19" }];
    expect(bucketByDay(items).get("2026-10-19")?.map((i) => i.id)).toEqual(["school", "bill"]);
    expect(bucketByDay(items).has("2026-10-18")).toBe(false);
  });
});

test("a household in another zone has its own days", () => {
  underEachZone(() => {
    // 20:00 Sunday 18 October in Los Angeles is Monday in Manila and in UTC.
    const at = familyInstant("2026-10-18", "20:00", "America/Los_Angeles")!;
    expect(familyDay(at, "America/Los_Angeles")).toBe("2026-10-18");
    expect(familyDay(at, MANILA)).toBe("2026-10-19");
  });
});

test("weeks start on the household's chosen day, from the date alone", () => {
  underEachZone(() => {
    // Monday 19 October 2026.
    expect(weekStartDay("2026-10-19", 1)).toBe("2026-10-19");
    expect(weekStartDay("2026-10-19", 0)).toBe("2026-10-18");
    expect(weekStartDay("2026-10-18", 1)).toBe("2026-10-12");
    expect(dayColumnOf("2026-10-18", 1)).toBe(6);
    expect(dayColumnOf("2026-10-01", 0)).toBe(4); // a Thursday
    expect(daysFrom("2026-10-30", 4)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

test("the month run carries on through December, with each month's length", () => {
  underEachZone(() => {
    const months = monthsAround("2026-10-19", 2, 3);
    expect(months.map((m) => m.key)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(months.map((m) => m.daysInMonth)).toEqual([31, 30, 31, 30, 31, 31]);
    expect(dayAfterMonths(months)).toBe("2027-02-01");
    expect(monthsAround("2028-02-10", 0, 0)[0].daysInMonth).toBe(29);
    // The same day of the month where it exists, else the month's last.
    expect(sameDayIn(months[1], 31)).toBe("2026-09-30");
    expect(sameDayIn(months[2], 19)).toBe("2026-10-19");
  });
});

test("the year's counts are by household day", () => {
  underEachZone(() => {
    const at = familyInstant("2026-01-01", "06:00", MANILA)!; // 31 December in UTC
    const counts = countsByMonth([{ day: familyDay(at, MANILA) }, { day: "2026-12-31" }, { day: "2025-12-31" }], 2026);
    expect(counts[0]).toBe(1);
    expect(counts[11]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

test("labels are the date's own, not the clock's", () => {
  underEachZone(() => {
    expect(dayHeading("2026-10-19")).toBe("Monday 19 Oct");
    expect(monthShort("2026-09-01")).toBe("Sept");
    expect(monthLong("2026-10-19")).toBe("October 2026");
    expect(weekLabel("2026-10-19")).toBe("October 2026");
    expect(weekLabel("2026-09-28")).toBe("Sept – Oct 2026");
    expect(weekLabel("2026-12-28")).toBe("Dec – Jan 2027");
    expect(isPastDay("2026-10-18", "2026-10-19")).toBe(true);
    expect(isPastDay("2026-10-19", "2026-10-19")).toBe(false);
  });
});

test("a repeating task lands on the household's days, at its own time", () => {
  underEachZone(() => {
    // Every Monday at 7:00 Manila, from 5 October.
    const start = familyInstant("2026-10-05", "07:00", MANILA)!;
    const at = occurrenceStarts({ repeat: "weekly" }, start, "2026-10-18", "2026-10-25", MANILA);
    expect(at.map((d) => familyDay(d, MANILA))).toEqual(["2026-10-19"]);
    expect(familyDay(at[0], "UTC")).toBe("2026-10-18");
  });
});

test("routines, given household days, give back household days", () => {
  underEachZone(() => {
    // Mon/Wed/Fri chores from 1 October, over the week of 19 October.
    const occ = expandRoutine(
      { freq: "weekly", repeat_interval: 1, byweekday: [1, 3, 5], bymonthday: null, start_date: "2026-10-01", end_date: null },
      parseISODate("2026-10-19"),
      parseISODate("2026-10-26"),
    );
    expect(occ.map((o) => toISODate(o.date))).toEqual(["2026-10-19", "2026-10-21", "2026-10-23"]);
  });
});

test("an all-day item starts at the household's midnight", () => {
  underEachZone(() => {
    expect(familyMidnight("2026-10-19", MANILA)?.toISOString()).toBe("2026-10-18T16:00:00.000Z");
  });
});

test("a timed instant on the day the clocks change keeps its wall-clock time", () => {
  underEachZone(() => {
    // New York leaves summer time at 2:00 on 1 November 2026: midnight that
    // day is UTC-4, 9:00 is UTC-5.
    expect(familyInstant("2026-11-01", "09:00", "America/New_York")?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(familyInstant("2026-10-31", "09:00", "America/New_York")?.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    // And into summer time, 8 March 2026.
    expect(familyInstant("2026-03-08", "09:00", "America/New_York")?.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    // A half-hour zone, and Manila, unchanged.
    expect(familyInstant("2026-10-19", "09:00", "Asia/Kolkata")?.toISOString()).toBe("2026-10-19T03:30:00.000Z");
    expect(familyInstant("2026-10-19", "09:00", MANILA)?.toISOString()).toBe("2026-10-19T01:00:00.000Z");
  });
});
