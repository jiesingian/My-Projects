import { expect, test } from "@playwright/test";
import { allRows } from "@/lib/queries/all-rows";

// A stand-in for a query that answers at most `cap` rows a request, as the
// API does at 1000.
const source = (n: number, cap = 1000) => async (from: number, to: number) => ({
  data: Array.from({ length: Math.max(0, Math.min(n, to + 1, from + cap) - from) }, (_, i) => from + i),
  error: null,
});

test("reads past the 1000-row page, every row once and in order", async () => {
  const rows = await allRows(source(2345));
  expect(rows.length).toBe(2345);
  expect(rows[0]).toBe(0);
  expect(rows[2344]).toBe(2344);
  expect(new Set(rows).size).toBe(2345);
});

test("a short or empty first page is one request", async () => {
  let calls = 0;
  const counted = async (from: number, to: number) => (calls++, source(10)(from, to));
  expect(await allRows(counted)).toHaveLength(10);
  expect(calls).toBe(1);
  expect(await allRows(source(0))).toEqual([]);
});

test("exactly a full page asks once more and stops on the empty one", async () => {
  expect(await allRows(source(1000))).toHaveLength(1000);
});

test("an error keeps what came so far", async () => {
  const failing = async (from: number, to: number) => (from >= 1000 ? { data: null, error: new Error("timeout") } : source(5000)(from, to));
  expect(await allRows(failing)).toHaveLength(1000);
});
