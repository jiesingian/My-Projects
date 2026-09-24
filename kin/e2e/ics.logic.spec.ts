import { test, expect } from "@playwright/test";
import { buildIcs, icsEscape, icsFold } from "@/lib/ics";

/** The calendar link Apple Calendar and Outlook subscribe to. A malformed
 * feed is not an error anyone sees: the phone just quietly stops updating. */

const now = new Date("2026-09-24T00:00:00Z");

test("iCalendar syntax characters in a title are escaped", () => {
  expect(icsEscape("Dinner; bring rice, ube\\cake\nat 7")).toBe("Dinner\; bring rice\\, ube\\\\cake\\nat 7");
});

test("long lines fold at 75 bytes without splitting a character", () => {
  const folded = icsFold("SUMMARY:" + "ñ".repeat(60));
  for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "ñ".repeat(60));
});

test("a timed task, a weekly one and a yearly birthday come out as the right events", () => {
  const ics = buildIcs("Kin", [
    { uid: "a-1", title: "Dentist", starts_at: "2026-10-01T01:00:00+00:00", ends_at: null, all_day: null, all_day_end: null, yearly: false, repeat: "once", location: "Makati", notes: null },
    { uid: "a-2", title: "Piano", starts_at: "2026-10-02T09:00:00Z", ends_at: "2026-10-02T10:00:00Z", all_day: null, all_day_end: null, yearly: false, repeat: "weekly", location: null, notes: null },
    { uid: "e-1", title: "Lola's birthday", starts_at: null, ends_at: null, all_day: "1946-10-02", all_day_end: null, yearly: true, repeat: null, location: null, notes: null },
  ], now);
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("DTSTART:20261001T010000Z\r\nDTEND:20261001T020000Z");
  expect(ics).toContain("RRULE:FREQ=WEEKLY");
  expect(ics).toContain("DTSTART;VALUE=DATE:19461002\r\nDTEND;VALUE=DATE:19461003\r\nRRULE:FREQ=YEARLY");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
});
