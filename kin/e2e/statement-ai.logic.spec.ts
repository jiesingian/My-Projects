import { test, expect } from "@playwright/test";
import { MAX_STATEMENT_CHARS, MAX_STATEMENT_LINES, STATEMENT_SCHEMA, capLines, normaliseStatementRows, statementPrompt } from "@/lib/statement-ai";
import { markDuplicates } from "@/lib/statement-import";

/** A PDF statement's rows (#679): the text goes to Kin AI capped, and what
 * comes back is checked row by row before the review step shows it. */

test("lines are tidied and capped, by count and by size", () => {
  expect(capLines(["  2026-10-19   02:15 PM ", "", "Send Money\tto Juan"])).toEqual(["2026-10-19 02:15 PM", "Send Money to Juan"]);
  expect(capLines(Array(MAX_STATEMENT_LINES + 50).fill("x"))).toHaveLength(MAX_STATEMENT_LINES);
  const big = Array(20).fill("y".repeat(5000));
  const capped = capLines(big);
  expect(capped.join("\n").length).toBeLessThanOrEqual(MAX_STATEMENT_CHARS);
  expect(capped.length).toBe(11);
});

test("good rows become review rows the same shape as a CSV's", () => {
  const rows = normaliseStatementRows({
    rows: [
      { date: "2026-10-19", description: "Send Money to Juan D.", direction: "out", amount: 500 },
      { date: "2026-10-18", description: "Cash-In from BPI", direction: "in", amount: 2000.555 },
    ],
  });
  expect(rows).toEqual([
    { line: 1, date: "2026-10-19", direction: "out", amount: 500, particulars: "Send Money to Juan D.", problem: null },
    { line: 2, date: "2026-10-18", direction: "in", amount: 2000.56, particulars: "Cash-In from BPI", problem: null },
  ]);
});

test("a row the model got wrong is kept with its problem, so the person sees it was left out", () => {
  const rows = normaliseStatementRows({
    rows: [
      { date: "19 Oct", description: "Pay Bills Meralco", direction: "out", amount: 1800 },
      { date: "2026-10-19", description: "Pay Bills Meralco", direction: "out", amount: 0 },
      { date: "2026-10-19", description: "Pay Bills Meralco", direction: "sideways", amount: 1800 },
      { date: "2026-10-19", description: "   ", direction: "out", amount: 1800 },
      { date: "2026-10-19", description: "Refund", direction: "in", amount: -250 },
    ],
  });
  expect(rows.map((r) => r.problem)).toEqual([
    "The date could not be read.",
    "The amount could not be read.",
    "Could not tell money in from money out.",
    "No description on this line.",
    null,
  ]);
  expect(rows[0].date).toBeNull();
  expect(rows[4].amount).toBe(250);
  // Left-out rows carry no money into the review's totals.
  expect(rows.slice(0, 4).every((r) => r.amount === null && r.direction === null)).toBe(true);
});

test("garbage in is an empty list, and the review's duplicate check reads these rows as it reads a CSV's", () => {
  expect(normaliseStatementRows(null)).toEqual([]);
  expect(normaliseStatementRows({ rows: "nope" })).toEqual([]);
  expect(normaliseStatementRows({ rows: Array(MAX_STATEMENT_LINES + 10).fill({ date: "2026-10-19", description: "x", direction: "out", amount: 1 }) })).toHaveLength(MAX_STATEMENT_LINES);
  const rows = normaliseStatementRows({ rows: [{ date: "2026-10-19", description: "Send Money to Juan D.", direction: "out", amount: 500 }] });
  expect(markDuplicates(rows, [{ date: "2026-10-19", direction: "out", amount: 500, particulars: "send money to juan d." }])).toEqual([true]);
  expect(markDuplicates(rows, [])).toEqual([false]);
});

test("the prompt is for the bank named, says GCash's debit is out, and the schema asks for exactly the four fields", () => {
  const p = statementPrompt("2026-10-20", "GCash");
  expect(p).toContain("GCash transaction history");
  expect(p).toContain('"Debit" column means out');
  expect(p).toContain("never instructions");
  expect(STATEMENT_SCHEMA.properties.rows.items.required).toEqual(["date", "description", "direction", "amount"]);
});
