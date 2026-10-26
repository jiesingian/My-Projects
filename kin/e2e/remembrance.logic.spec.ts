import { test, expect } from "@playwright/test";
import { diedOnProblem, fortiethDay, isUndas, namesLine, remembranceItems, remembranceOn } from "@/lib/remembrance";

/** Undas and babang-luksa (20261019233000_remembrance_undas.sql): the days
 * Today, Coming up and the tree's candle read. The morning push
 * (due_remembrance_reminders) keeps the same days; the PGlite probe holds it
 * to them. */

const lola = { id: "lola", name: "Lola Remedios", diedOn: "2019-11-04" };
const lolo = { id: "lolo", name: "Lolo Ben", diedOn: "2025-10-30" };
const tita = { id: "tita", name: "Tita Leap", diedOn: "2024-02-29" };
const tito = { id: "tito", name: "Tito Recent", diedOn: "2026-09-22" };

test("Undas is 1 and 2 November", () => {
  expect(isUndas("2026-11-01")).toBe(true);
  expect(isUndas("2026-11-02")).toBe(true);
  expect(isUndas("2026-10-31")).toBe(false);
  expect(isUndas("2026-11-03")).toBe(false);
});

test("the 40th day counts the day of passing as the first", () => {
  expect(fortiethDay("2026-09-22")).toBe("2026-10-31");
  expect(remembranceOn(tito, "2026-10-31")?.kind).toBe("fortieth");
  expect(remembranceOn(tito, "2026-10-30")).toBeNull();
});

test("the first year is the babang-luksa; later years are counted", () => {
  expect(remembranceOn(lolo, "2026-10-30")).toMatchObject({ kind: "first-year", years: 1 });
  expect(remembranceOn(lola, "2026-11-04")).toMatchObject({ kind: "anniversary", years: 7 });
  expect(remembranceOn(lola, "2019-11-04")).toBeNull();
});

test("a 29 February passing is remembered on 28 February in other years, and on the 29th in leap years", () => {
  expect(remembranceOn(tita, "2027-02-28")).toMatchObject({ years: 3 });
  expect(remembranceOn(tita, "2028-02-28")).toBeNull();
  expect(remembranceOn(tita, "2028-02-29")).toMatchObject({ years: 4 });
});

test("names: up to three, then how many more", () => {
  expect(namesLine(["A"])).toBe("A");
  expect(namesLine(["A", "B"])).toBe("A and B");
  expect(namesLine(["A", "B", "C"])).toBe("A, B and C");
  expect(namesLine(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
});

test("Coming up a week before Undas names everyone remembered, oldest passing first", () => {
  const items = remembranceItems([lolo, lola, tito], "2026-10-26");
  const undas = items.find((i) => i.id === "undas-2026-11-01")!;
  expect(undas.inDays).toBe(6);
  expect(undas.title).toBe("All Saints' Day in 6 days");
  expect(undas.meta).toBe("Lola Remedios, Lolo Ben and Tito Recent · candles and flowers?");
  // Lolo Ben's first year on the 30th, Tito's 40th day on the 31st.
  expect(items.map((i) => i.id)).toEqual(["remember-lolo-2026-10-30", "remember-tito-2026-10-31", "undas-2026-11-01"]);
});

test("on Undas itself, Today says who is remembered, on both days", () => {
  for (const d of ["2026-11-01", "2026-11-02"]) {
    const today = remembranceItems([lola, lolo], d, 0);
    expect(today).toEqual([{ id: `undas-${d}`, title: "All Saints' Day · remembering", meta: "Lola Remedios and Lolo Ben", inDays: 0 }]);
  }
});

test("nobody passed yet by then, nothing; no date, nothing", () => {
  expect(remembranceItems([{ id: "x", name: "X", diedOn: "2026-11-05" }], "2026-10-28")).toEqual([]);
  expect(remembranceItems([{ id: "x", name: "X", diedOn: "" }], "2026-10-28")).toEqual([]);
});

test("a date of passing: real, not in the future, not before birth", () => {
  expect(diedOnProblem("2026-02-30", null, "2026-10-19")).toBe("That date isn't a real date.");
  expect(diedOnProblem("2026-10-20", null, "2026-10-19")).toBe("A date of passing can't be in the future.");
  expect(diedOnProblem("1990-01-01", "1991-01-01", "2026-10-19")).toBe("The date of passing is before their birth.");
  expect(diedOnProblem("2020-01-01", "1931-03-02", "2026-10-19")).toBeNull();
});
