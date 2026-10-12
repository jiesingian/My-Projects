import { test, expect } from "@playwright/test";
import { nextEventDate } from "@/lib/grocery";

/** Which day an event is offered under on the shopping list (12 October):
 * its next turn if it comes round every year, its own date otherwise. */
test("a yearly event is offered at its next turn", () => {
  const birthday = { event_date: "2018-10-24", recurs_yearly: true };
  expect(nextEventDate(birthday, "2026-10-12")).toBe("2026-10-24");
  expect(nextEventDate(birthday, "2026-10-24")).toBe("2026-10-24");
  expect(nextEventDate(birthday, "2026-10-25")).toBe("2027-10-24");
});

test("a 29 February birthday lands on 1 March in a year without one", () => {
  expect(nextEventDate({ event_date: "2016-02-29", recurs_yearly: true }, "2027-01-10")).toBe("2027-03-01");
  expect(nextEventDate({ event_date: "2016-02-29", recurs_yearly: true }, "2028-01-10")).toBe("2028-02-29");
});

test("a one-off keeps its date, and a trip still on counts as today", () => {
  expect(nextEventDate({ event_date: "2026-11-02" }, "2026-10-12")).toBe("2026-11-02");
  expect(nextEventDate({ event_date: "2026-09-01" }, "2026-10-12")).toBe("2026-09-01");
  expect(nextEventDate({ event_date: "2026-10-10", end_date: "2026-10-15" }, "2026-10-12")).toBe("2026-10-12");
});
