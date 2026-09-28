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

const ME = "me-id";
const routine = (over: Partial<import("../src/lib/brief").BriefRoutine>) => ({
  title: "Chore", freq: "daily" as const, repeat_interval: 1, byweekday: [], bymonthday: null, start_date: "2026-09-01", end_date: null,
  time_of_day: null, location: null, whole_family: false, rotate: false, members: [ME], logged: [], ...over,
});

test("today's chores that are still mine are read out; done ones, other people's and other days' are not", () => {
  const text = buildBrief("Janine", [], NOW, undefined, {
    me: ME,
    routines: [
      routine({ title: "Water the plants" }),
      routine({ title: "Take out trash", logged: ["2026-09-28"] }),
      routine({ title: "Keira's chore", members: ["keira"] }),
      routine({ title: "Mop", freq: "weekly", byweekday: [1] }), // Monday
      routine({ title: "Laundry", freq: "weekly", byweekday: [6] }), // Saturday
      routine({ title: "Whole-family tidy", members: [], whole_family: true }),
    ],
  });
  expect(text).toContain("Chores to do: Water the plants, Mop and Whole-family tidy.");
  expect(text).not.toContain("Take out trash");
  expect(text).not.toContain("Keira");
  expect(text).not.toContain("Laundry");
});

test("a rota says the chore only on my turn", () => {
  // Daily from 1 September: index 27 on the 28th; two on the rota, so it is
  // the second person's turn (27 % 2 = 1).
  const mine = buildBrief("Janine", [], NOW, undefined, { me: ME, routines: [routine({ title: "Dishes", rotate: true, members: ["other", ME] })] });
  const theirs = buildBrief("Janine", [], NOW, undefined, { me: ME, routines: [routine({ title: "Dishes", rotate: true, members: [ME, "other"] })] });
  expect(mine).toContain("Dishes");
  expect(theirs).not.toContain("Dishes");
});

test("a chore with a time joins the timed list in order", () => {
  const text = buildBrief("Janine", [item({ title: "Dentist", starts_at: "2026-09-28T02:00:00Z" })], NOW, undefined, {
    me: ME,
    routines: [routine({ title: "Feed the dog", time_of_day: "09:30:00" })],
  });
  expect(text).toContain("2 things still to come.\nAt 9:30 AM, Feed the dog.\nAt 10 AM, Dentist.");
});

test("running low is said near the end", () => {
  const text = buildBrief("Jonathan", [], NOW, undefined, { low: ["Rice", "Cooking oil"] });
  expect(text).toContain("There's nothing on the calendar today.\nRunning low: Rice and Cooking oil.\nThat's everything.");
});
