import { test, expect } from "@playwright/test";
import { toGoogleEventBody, eventStartEnd } from "@/lib/calendar-shape";
import { familyMidnight, familyDay } from "@/lib/time";

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
