import { test, expect } from "@playwright/test";
import { buildBrief, spokenTime, type BriefItem } from "../src/lib/brief";

/** "Today in Kin": the sentences the iPhone reads aloud. Monday 28 September
 * 2026, 9:00 in Manila (01:00 UTC). */
const NOW = new Date("2026-09-28T01:00:00Z");
const item = (over: Partial<BriefItem>): BriefItem => ({ title: "x", starts_at: null, ends_at: null, all_day: null, all_day_end: null, yearly: false, repeat: "once", location: null, ...over });

test("times are said the way a person says them", () => {
  expect(spokenTime(new Date("2026-09-28T01:00:00Z"))).toBe("9 AM");
  expect(spokenTime(new Date("2026-09-28T07:30:00Z"))).toBe("3:30 PM");
});

test("greets, gives the date, and lists what is left with times, in order", () => {
  const text = buildBrief("Jonathan Singian", [
    item({ title: "Pick up Keira", starts_at: "2026-09-28T07:30:00Z" }),
    item({ title: "Dentist", starts_at: "2026-09-28T02:00:00Z", location: "Makati clinic" }),
    item({ title: "Tomorrow's thing", starts_at: "2026-09-29T02:00:00Z" }),
  ], NOW);
  expect(text).toBe(
    ["Good morning, Jonathan. It's Monday 28 September.", "2 things still to come.", "At 10 AM, Dentist, at Makati clinic.", "At 3:30 PM, Pick up Keira.", "That's everything. Have a good day."].join("\n"),
  );
});

test("repeating tasks come up on their day", () => {
  const items = [
    item({ title: "Swimming", starts_at: "2026-09-14T09:00:00Z", repeat: "weekly" }), // a Monday two weeks ago
    item({ title: "Piano", starts_at: "2026-09-15T09:00:00Z", repeat: "weekly" }), // a Tuesday
    item({ title: "Rent", starts_at: "2026-08-28T03:00:00Z", repeat: "monthly" }),
    item({ title: "Anniversary dinner", starts_at: "2025-09-28T11:00:00Z", repeat: "yearly" }),
  ];
  const text = buildBrief("Janine", items, NOW);
  expect(text).toContain("Swimming");
  expect(text).not.toContain("Piano");
  expect(text).toContain("At 11 AM, Rent.");
  expect(text).toContain("At 7 PM, Anniversary dinner.");
});

test("all-day things and birthdays come first", () => {
  const text = buildBrief("Janine", [
    item({ title: "Lola's birthday", all_day: "1950-09-28", yearly: true, repeat: null }),
    item({ title: "Beach trip", all_day: "2026-09-27", all_day_end: "2026-09-29", repeat: null }),
    item({ title: "Old trip", all_day: "2026-09-20", all_day_end: "2026-09-21", repeat: null }),
  ], NOW);
  expect(text).toContain("Today: Lola's birthday, and Beach trip.");
  expect(text).not.toContain("Old trip");
});

test("only a count of what is already past, and a plain line when the day is empty", () => {
  const later = new Date("2026-09-28T08:00:00Z"); // 4 PM
  const text = buildBrief("Janine", [
    item({ title: "Breakfast meeting", starts_at: "2026-09-28T00:00:00Z" }),
    item({ title: "School run", starts_at: "2026-09-28T00:30:00Z" }),
    item({ title: "Dinner", starts_at: "2026-09-28T11:00:00Z" }),
  ], later);
  expect(text).toContain("Good afternoon, Janine.");
  expect(text).not.toContain("Breakfast meeting");
  expect(text).toContain("2 more were earlier today.");
  expect(buildBrief("Janine", [], NOW)).toContain("There's nothing on the calendar today.");
});
