import { test, expect } from "@playwright/test";
import { collapseRemoved, removedRunLabel } from "@/lib/chat-collapse";

/** Runs of unsent messages fold into one "N messages removed" row; a lone
 * one stays as it is, and real messages are never touched. */

type M = { id: string; deleted: boolean };
const m = (id: string, deleted = false): M => ({ id, deleted });
const removed = (x: M) => x.deleted;

test("a single removed message is left alone", () => {
  const rows = collapseRemoved([m("a"), m("b", true), m("c")], removed);
  expect(rows.map((r) => r.kind)).toEqual(["one", "one", "one"]);
});

test("two or more in a row become one row that remembers its ends", () => {
  const rows = collapseRemoved([m("a"), m("b", true), m("c", true), m("d", true), m("e")], removed);
  expect(rows.map((r) => r.kind)).toEqual(["one", "removed", "one"]);
  const run = rows[1];
  if (run.kind !== "removed") throw new Error("expected a run");
  expect(run.count).toBe(3);
  expect(run.first.id).toBe("b");
  expect(run.last.id).toBe("d");
});

test("runs at either end, and back to back with a lone one between, fold separately", () => {
  const rows = collapseRemoved([m("a", true), m("b", true), m("c"), m("d", true), m("e"), m("f", true), m("g", true)], removed);
  expect(rows.map((r) => (r.kind === "removed" ? `removed×${r.count}` : r.m.id))).toEqual(["removed×2", "c", "d", "e", "removed×2"]);
});

test("nothing removed means nothing changes, and an empty thread stays empty", () => {
  expect(collapseRemoved([m("a"), m("b")], removed).map((r) => r.kind)).toEqual(["one", "one"]);
  expect(collapseRemoved([], removed)).toEqual([]);
});

test("the label counts", () => {
  expect(removedRunLabel(5)).toBe("5 messages removed");
});
