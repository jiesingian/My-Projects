import { test, expect } from "@playwright/test";
import { toGoogleEventBody, eventStartEnd, allDayEvent, syncLinkPatch } from "@/lib/calendar-shape";
import { familyMidnight, familyDay, addDays, weekdayOf } from "@/lib/time";

/** What goes to Google, and what comes back.
 *
 * These paths had no coverage of any kind, and two of the eleven date fixes
 * made on 8 September lived in them -- found by reading, not by a failing
 * test. They were untestable for a structural reason rather than a lazy one:
 * the shaping was private to a "use server" module and to one that reaches for
 * the service key, so nothing outside a request could call it. Pulling the
 * pure part into calendar-shape.ts is what makes this file possible.
 *
 * What this still cannot do is talk to Google. A real OAuth round trip needs
 * credentials the suite does not have, so the network layer is exercised
 * against a stubbed fetch: it proves the request we build and how we read the
 * reply, not that Google accepts it.
 *
 * NOTE ON THE ZONE, which is the whole point of several of these. This process
 * runs in UTC; production runs in Asia/Manila. That mismatch is deliberate --
 * every calendar bug so far has been "correct in the environment it was
 * written in" -- so anything below that depends on the process clock rather
 * than on the household's stated zone will fail here and pass on the server,
 * which is exactly the alarm worth having. */

test.describe("what we send to Google", () => {
  /** The bug that put every birthday, bill, trip and meal on the family's
   * phones a day early. An all-day item on the 9th must reach Google as the
   * 9th, and Google's end date is exclusive, so a one-day item ends on the
   * 10th. */
  test("an all-day item lands on the day it was given", () => {
    const body = toGoogleEventBody({
      title: "Erynne's birthday",
      startAt: familyMidnight("2026-09-09")!,
      allDay: true,
    });

    expect(body.start).toEqual({ date: "2026-09-09" });
    expect(body.end, "Google's end date is exclusive, so a single day ends on the next").toEqual({
      date: "2026-09-10",
    });
    expect(body).not.toHaveProperty("start.dateTime");
  });

  test("a multi-day trip covers every day of it", () => {
    const body = toGoogleEventBody({
      title: "Baguio",
      startAt: familyMidnight("2026-09-09")!,
      endAt: familyMidnight("2026-09-12")!,
      allDay: true,
    });

    expect(body.start).toEqual({ date: "2026-09-09" });
    expect(body.end, "the last day of the trip would otherwise be missing").toEqual({ date: "2026-09-13" });
  });

  test("a timed event goes as an instant, and defaults to an hour", () => {
    const start = new Date("2026-09-19T10:00:00.000Z"); // 18:00 in Manila
    const body = toGoogleEventBody({ title: "Evening mass", startAt: start });

    expect(body.start).toEqual({ dateTime: "2026-09-19T10:00:00.000Z" });
    expect(body.end).toEqual({ dateTime: "2026-09-19T11:00:00.000Z" });
  });

  test("an end that was given is the end that is sent", () => {
    const body = toGoogleEventBody({
      title: "Study Math with Erynne",
      startAt: new Date("2026-09-07T12:30:00.000Z"),
      endAt: new Date("2026-09-07T13:30:00.000Z"),
    });
    expect(body.end).toEqual({ dateTime: "2026-09-07T13:30:00.000Z" });
  });

  /** A reminder is the only part of this that reaches a phone's lock screen,
   * and an override replaces the member's own defaults -- so sending one when
   * none was asked for would quietly silence their usual alert. */
  test("no reminder means the member's own default, not silence", () => {
    const withNone = toGoogleEventBody({ title: "x", startAt: new Date("2026-09-09T00:00:00Z") });
    expect(withNone.reminders, "an absent reminder must not override the member's defaults").toBeUndefined();

    const withOne = toGoogleEventBody({ title: "x", startAt: new Date("2026-09-09T00:00:00Z"), reminderMinutes: 30 });
    expect(withOne.reminders).toEqual({ useDefault: false, overrides: [{ method: "popup", minutes: 30 }] });
  });

  test("a routine goes as one recurring event, not one per occurrence", () => {
    const rrule = ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"];
    const body = toGoogleEventBody({ title: "Piano", startAt: new Date("2026-09-09T01:00:00Z"), recurrence: rrule });
    expect(body.recurrence).toEqual(rrule);

    const none = toGoogleEventBody({ title: "Piano", startAt: new Date("2026-09-09T01:00:00Z"), recurrence: [] });
    expect(none.recurrence, "an empty list must not be sent as one").toBeUndefined();
  });
});

test.describe("what we make of what Google sends back", () => {
  /** The one that must not depend on where the server is. Google sends an
   * all-day event as a bare "2026-09-09" with no zone in it at all; turning
   * that into an instant and back is the only thing that can go wrong, so the
   * date is carried through untouched.
   *
   * Under the old code this test would fail here and pass in production. */
  test("an all-day event keeps its day whatever zone we are in", () => {
    const when = eventStartEnd({ id: "e1", status: "confirmed", start: { date: "2026-09-09" }, end: { date: "2026-09-10" } });

    expect(when).not.toBeNull();
    expect(when!.day, `this process is ${Intl.DateTimeFormat().resolvedOptions().timeZone}; the answer must not depend on that`).toBe(
      "2026-09-09",
    );
    expect(when!.allDay).toBe(true);
    // And the instant it produces is midnight in the household's zone.
    expect(when!.start.toISOString()).toBe("2026-09-08T16:00:00.000Z");
  });

  /** An event early in the household's morning is the previous day in UTC.
   * Filing it by the UTC date is what put incoming events a day early. */
  test("an early-morning event belongs to the household's day, not UTC's", () => {
    const when = eventStartEnd({
      id: "e2",
      status: "confirmed",
      start: { dateTime: "2026-09-08T23:30:00.000Z" }, // 07:30 on the 9th in Manila
    });

    expect(when!.day, "23:30 UTC is already tomorrow morning in the household").toBe("2026-09-09");
    expect(when!.allDay).toBe(false);
    expect(when!.end).toBeNull();
  });

  test("a timed event keeps both ends", () => {
    const when = eventStartEnd({
      id: "e3",
      status: "confirmed",
      start: { dateTime: "2026-09-07T12:30:00.000Z" },
      end: { dateTime: "2026-09-07T13:30:00.000Z" },
    });
    expect(when!.start.toISOString()).toBe("2026-09-07T12:30:00.000Z");
    expect(when!.end!.toISOString()).toBe("2026-09-07T13:30:00.000Z");
    expect(when!.day).toBe("2026-09-07"); // 20:30 Manila
  });

  test("an event with no start at all is refused rather than guessed at", () => {
    expect(eventStartEnd({ id: "e4", status: "confirmed" })).toBeNull();
    expect(eventStartEnd({ id: "e5", status: "confirmed", start: {} })).toBeNull();
  });

  test("a date Google could not have meant is refused", () => {
    expect(eventStartEnd({ id: "e6", status: "confirmed", start: { date: "2026-09-31" } })).toBeNull();
    expect(eventStartEnd({ id: "e7", status: "confirmed", start: { date: "not a date" } })).toBeNull();
  });
});

test.describe("the household's midnight", () => {
  test("is midnight where the household is, not where the process is", () => {
    expect(familyMidnight("2026-09-09")!.toISOString()).toBe("2026-09-08T16:00:00.000Z");
    // The round trip that matters: a day in, the same day out.
    for (const day of ["2026-01-01", "2026-06-15", "2026-09-09", "2026-12-31"]) {
      expect(familyDay(familyMidnight(day)!), `${day} did not survive the round trip`).toBe(day);
    }
  });

  test("refuses what is not a plain date", () => {
    for (const bad of ["", "nonsense", "2026-09-31", "2026-13-01", "09/09/2026", "2026-9-9"]) {
      expect(familyMidnight(bad), `${bad || "(empty)"} was accepted`).toBeNull();
    }
  });
});

test.describe("building an all-day item", () => {
  /** The caller no longer constructs the instant, which is the whole point:
   * every all-day sync used to write `new Date(`${date}T00:00:00`)` and get
   * midnight wherever the process happened to be. */
  test("a plain date becomes the right day on Google", () => {
    const input = allDayEvent("Erynne's birthday", "2026-09-09");
    expect(input).not.toBeNull();

    const body = toGoogleEventBody(input!);
    expect(body.start, `built in ${Intl.DateTimeFormat().resolvedOptions().timeZone}, and it must not matter`).toEqual({
      date: "2026-09-09",
    });
    expect(body.end).toEqual({ date: "2026-09-10" });
  });

  test("a trip keeps both ends", () => {
    const body = toGoogleEventBody(allDayEvent("Baguio", "2026-09-09", { endDay: "2026-09-12" })!);
    expect(body.start).toEqual({ date: "2026-09-09" });
    expect(body.end).toEqual({ date: "2026-09-13" });
  });

  test("no end day is a single day", () => {
    const body = toGoogleEventBody(allDayEvent("Electricity due", "2026-09-09", { endDay: null })!);
    expect(body.end).toEqual({ date: "2026-09-10" });
  });

  /** Reachable from the assistant, whose arguments a model writes. Not syncing
   * is the right answer: a birthday missing from a phone gets noticed and
   * fixed, and a birthday on the wrong day does not. */
  test("a date we cannot read syncs nothing rather than the wrong day", () => {
    for (const bad of ["", "nonsense", "2026-09-31", "9 September 2026", "2026-9-9"]) {
      expect(allDayEvent("x", bad), `${bad || "(empty)"} was accepted`).toBeNull();
    }
  });

  test("an unreadable end day refuses the whole thing, rather than shortening the trip", () => {
    expect(
      allDayEvent("Baguio", "2026-09-09", { endDay: "next Tuesday" }),
      "a trip whose end could not be read would silently become one day long",
    ).toBeNull();
  });
});

test.describe("what we remember after pulling a calendar", () => {
  const NOW = "2026-09-08T09:00:00.000Z";

  test("a clean batch advances the sync token", () => {
    expect(syncLinkPatch("tok-2", 0, NOW)).toEqual({ last_synced_at: NOW, sync_token: "tok-2" });
  });

  /** The one that matters. Google's sync token means "you have seen everything
   * up to here", so saving it after a change we could not write means that
   * change is never sent again -- an edit someone made on their phone is gone,
   * not delayed, and nothing says so. */
  test("a batch with any failure does not advance it", () => {
    const patch = syncLinkPatch("tok-2", 1, NOW);
    expect(patch, "the token must not move past a change that failed to apply").not.toHaveProperty("sync_token");
    expect(patch.last_synced_at, "we did talk to Google, so the page should still say when").toBe(NOW);
  });

  test("one failure among many is still a failure", () => {
    expect(syncLinkPatch("tok-2", 1, NOW)).not.toHaveProperty("sync_token");
    expect(syncLinkPatch("tok-2", 47, NOW)).not.toHaveProperty("sync_token");
  });

  /** A first sync has no token to keep; null is the value that means "start
   * from the beginning", and it must still be written on success. */
  test("a null next token is written, not skipped", () => {
    expect(syncLinkPatch(null, 0, NOW)).toEqual({ last_synced_at: NOW, sync_token: null });
  });
});

test.describe("day arithmetic with no clock in it", () => {
  /** Query bounds and week boundaries do not want an instant, and going
   * through Date only introduces the process clock as a way to be wrong. */
  test("a day plus one is the next day, everywhere", () => {
    expect(addDays("2026-09-09", 1)).toBe("2026-09-10");
    expect(addDays("2026-09-30", 1), "month end").toBe("2026-10-01");
    expect(addDays("2026-12-31", 1), "year end").toBe("2027-01-01");
    expect(addDays("2028-02-28", 1), "leap year").toBe("2028-02-29");
    expect(addDays("2026-09-01", -1), "backwards over a month").toBe("2026-08-31");
    expect(addDays("2026-09-09", 0)).toBe("2026-09-09");
  });

  test("a date that could not be meant is refused", () => {
    for (const bad of ["", "nonsense", "2026-09-31", "2026-13-01", "09/09/2026", "2026-9-9"]) {
      expect(addDays(bad, 1), `${bad || "(empty)"} was accepted`).toBeNull();
      expect(weekdayOf(bad), `${bad || "(empty)"} was accepted`).toBeNull();
    }
  });

  /** The grocery list is built from the Monday on or before the day asked
   * for -- a Sunday belongs to the week it ends, and used to be dropped from
   * its own list. That arithmetic now never touches a clock. */
  test("the Monday on or before is found without a clock", () => {
    const mondayOf = (day: string) => {
      const dow = weekdayOf(day)!;
      return addDays(day, -((dow + 6) % 7));
    };
    expect(mondayOf("2026-09-07"), "a Monday is its own Monday").toBe("2026-09-07");
    expect(mondayOf("2026-09-09"), "midweek").toBe("2026-09-07");
    expect(mondayOf("2026-09-13"), "a Sunday belongs to the week it ends").toBe("2026-09-07");
    expect(mondayOf("2026-09-14"), "the next Monday starts the next week").toBe("2026-09-14");
  });

  test("weekdays are read the same wherever the process is", () => {
    // 7 Sept 2026 is a Monday.
    expect(weekdayOf("2026-09-07")).toBe(1);
    expect(weekdayOf("2026-09-13")).toBe(0);
    expect(weekdayOf("2026-09-12")).toBe(6);
  });
});
