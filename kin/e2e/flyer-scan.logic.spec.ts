import { test, expect } from "@playwright/test";
import { normaliseScan } from "@/lib/flyer-scan";

/** What a flyer scan is allowed to propose. The model's JSON is checked like
 * any other input before a member is shown it, let alone before it is saved. */

const good = { title: "Recital", date: "2026-10-03", from: "14:00", to: "16:00", location: "Gym", notes: "Wear white" };

test("a well-formed item comes through untouched", () => {
  expect(normaliseScan({ items: [good] })).toEqual([good]);
});

test("an impossible date is dropped, not guessed at", () => {
  expect(normaliseScan({ items: [{ ...good, date: "2026-02-30" }, { ...good, date: "3 Oct" }] })).toEqual([]);
});

test("a time that is not a time is left blank, and an end before the start goes", () => {
  const [a] = normaliseScan({ items: [{ ...good, from: "2pm", to: "16:00" }] });
  expect([a.from, a.to]).toEqual(["", ""]);
  const [b] = normaliseScan({ items: [{ ...good, from: "16:00", to: "09:00" }] });
  expect([b.from, b.to]).toEqual(["16:00", ""]);
});

test("an untitled item is dropped and a long title is trimmed", () => {
  const out = normaliseScan({ items: [{ ...good, title: "  " }, { ...good, title: "x".repeat(400) }] });
  expect(out).toHaveLength(1);
  expect(out[0].title).toHaveLength(150);
});

test("garbage in is an empty list, and at most twenty come out", () => {
  expect(normaliseScan(null)).toEqual([]);
  expect(normaliseScan({ items: "nope" })).toEqual([]);
  expect(normaliseScan({ items: Array(30).fill(good) })).toHaveLength(20);
});
