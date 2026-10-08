import { test, expect } from "@playwright/test";
import { parseQuickLine, readableClock } from "@/lib/quick-line";

/** One-line add (lib/quick-line.ts): the sentence a person types into Today's
 * Quick add or the Planner's Add sheet, read by rules into a task, an event or
 * a shopping item. Fixed "today" so the days are checkable: Wednesday
 * 7 October 2026. */

const today = "2026-10-07";
const members = [
  { id: "ben", name: "Ben Singian" },
  { id: "janine", name: "Janine Singian" },
];
const read = (line: string, extra: { defaultDate?: string } = {}) => parseQuickLine(line, { today, members, meId: "janine", ...extra });

test("the example from the roadmap: a person, a weekday and a time make a task", () => {
  expect(read("Ben dentist Tue 3pm")).toEqual({
    kind: "task", title: "Ben dentist", date: "2026-10-13", from: "15:00", to: null, who: ["ben"], wholeFamily: false,
  });
});

test("buy with a quantity is a shopping item, quantity and unit split out", () => {
  expect(read("buy rice 2kg")).toMatchObject({ kind: "shopping", name: "Rice", quantity: 2, unit: "kg" });
  expect(read("buy 2 kg rice")).toMatchObject({ kind: "shopping", name: "Rice", quantity: 2, unit: "kg" });
  expect(read("need eggs x12")).toMatchObject({ kind: "shopping", name: "Eggs", quantity: 12, unit: null });
  expect(read("milk to the list")).toMatchObject({ kind: "shopping", name: "Milk", quantity: null });
});

test("a number before a word that is not a unit stays a count, the word stays the item", () => {
  expect(read("buy 3 mangoes")).toMatchObject({ kind: "shopping", name: "Mangoes", quantity: 3, unit: null });
});

test("get with a time or a name is a task, not groceries", () => {
  expect(read("get Ben from school 3pm")).toMatchObject({ kind: "task", from: "15:00", who: ["ben"] });
  expect(read("pick up cake tomorrow")).toMatchObject({ kind: "task", date: "2026-10-08" });
});

test("birthdays, anniversaries and trips are events; a time is kept as the note", () => {
  expect(read("Ben's birthday Oct 20")).toMatchObject({ kind: "event", eventKind: "birthday", title: "Ben's birthday", date: "2026-10-20", who: ["ben"] });
  expect(read("anniversary dinner 12 Nov 7pm")).toMatchObject({ kind: "event", eventKind: "anniversary", date: "2026-11-12", note: "at 19:00" });
  expect(read("Cebu trip with everyone next Fri")).toMatchObject({ kind: "event", eventKind: "travel", date: "2026-10-09", wholeFamily: true, who: [] });
});

test("days: relative words, weekdays, month dates (a gone one is next year), in N days", () => {
  expect(read("call plumber today")).toMatchObject({ date: today });
  expect(read("call plumber tmrw")).toMatchObject({ date: "2026-10-08" });
  // A weekday typed on that weekday is today; "next" pushes it a week.
  expect(read("swim wed")).toMatchObject({ date: "2026-10-07" });
  expect(read("swim next wed")).toMatchObject({ date: "2026-10-14" });
  expect(read("dentist Mar 3")).toMatchObject({ date: "2027-03-03" });
  expect(read("renew passport in 3 days")).toMatchObject({ date: "2026-10-10" });
  // 31 November does not exist: left in the title rather than rolled into December.
  expect(read("thing Nov 31")).toMatchObject({ date: today });
});

test("times: am/pm, 24-hour, noon, ranges, and a bare 'at 3' is the afternoon", () => {
  expect(read("meeting 9:30am")).toMatchObject({ from: "09:30" });
  expect(read("meeting 14:15")).toMatchObject({ from: "14:15" });
  expect(read("lunch noon")).toMatchObject({ from: "12:00" });
  expect(read("piano 3-4pm")).toMatchObject({ from: "15:00", to: "16:00" });
  expect(read("drill 11-1pm")).toMatchObject({ from: "11:00", to: "13:00" });
  expect(read("pickup at 3")).toMatchObject({ from: "15:00" });
  expect(read("jog at 6:30 am")).toMatchObject({ from: "06:30" });
  expect(read("dinner tonight")).toMatchObject({ date: today, from: "19:00" });
});

test("no day: the default day (the Planner's open day), else today; no name: the writer", () => {
  expect(read("fix the gate")).toMatchObject({ kind: "task", title: "Fix the gate", date: today, from: null, who: ["janine"] });
  expect(read("fix the gate", { defaultDate: "2026-10-21" })).toMatchObject({ date: "2026-10-21" });
});

test("a name inside another word is not that person", () => {
  expect(read("bench repair sat")).toMatchObject({ who: ["janine"] });
});

test("empty lines read as nothing; the preview's clock reads back in 12-hour", () => {
  expect(read("   ")).toBeNull();
  expect(readableClock("15:00")).toBe("3:00 pm");
  expect(readableClock("00:30")).toBe("12:30 am");
});
