import { test, expect } from "@playwright/test";
import { choreAnswerVerdict, choreLogVerdict, doseVerdict, offlineLine, toggleTarget } from "@/lib/offline/rules";

/** Offline ticks for medicines and chores (19 October): who wins when a
 * change made with no signal meets what happened in the meantime. The same
 * rules as the list, Today and the chat (app/api/offline/replay). */

const at = "2026-10-19T08:00:00.000Z";
const before = "2026-10-19T07:00:00.000Z";
const after = "2026-10-19T09:00:00.000Z";
const label = "Losartan at 08:00";

test("a dose ticked offline is saved, once", () => {
  expect(doseVerdict({ at, taken: true, label }, null)).toEqual({ apply: true });
  // Ticked by someone else already, or a replay sent twice: nothing to do.
  expect(doseVerdict({ at, taken: true, label }, { taken_at: after })).toEqual({ apply: false, outcome: "applied" });
});

test("an untick loses to someone who ticked the dose after it", () => {
  expect(doseVerdict({ at, taken: false, label }, { taken_at: after })).toEqual({ apply: false, outcome: "skipped", note: "Losartan at 08:00 was ticked by someone after you." });
  expect(doseVerdict({ at, taken: false, label }, { taken_at: before })).toEqual({ apply: true });
  expect(doseVerdict({ at, taken: false, label }, null)).toEqual({ apply: false, outcome: "applied" });
});

test("a chore already answered by someone else keeps their answer", () => {
  expect(choreLogVerdict({ label: "Dishes" }, null, "me")).toEqual({ apply: true });
  expect(choreLogVerdict({ label: "Dishes" }, { logged_by: "me" }, "me")).toEqual({ apply: false, outcome: "applied" });
  expect(choreLogVerdict({ label: "Dishes" }, { logged_by: "lola" }, "me")).toEqual({ apply: false, outcome: "skipped", note: "Dishes was already answered by someone else." });
});

test("an approval only lands while the chore still waits", () => {
  expect(choreAnswerVerdict({ approve: true, label: "Dishes" }, { approval: "pending", approved_by: null }, "me")).toEqual({ apply: true });
  // This grown-up's own answer, sent twice.
  expect(choreAnswerVerdict({ approve: true, label: "Dishes" }, { approval: "approved", approved_by: "me" }, "me")).toEqual({ apply: false, outcome: "applied" });
  // Another grown-up answered first: theirs stands, either way.
  expect(choreAnswerVerdict({ approve: false, label: "Dishes" }, { approval: "approved", approved_by: "tita" }, "me").apply).toBe(false);
  expect(choreAnswerVerdict({ approve: true, label: "Dishes" }, { approval: "rejected", approved_by: "tita" }, "me")).toMatchObject({ outcome: "skipped" });
  // Undone since, or never needed approval.
  expect(choreAnswerVerdict({ approve: true, label: "Dishes" }, null, "me")).toMatchObject({ outcome: "skipped" });
  expect(choreAnswerVerdict({ approve: true, label: "Dishes" }, { approval: "not_required", approved_by: null }, "me")).toMatchObject({ outcome: "skipped" });
});

test("a second tick on the same dose or item replaces the first in the queue", () => {
  const dose = { kind: "dose.set", medicineId: "m1", day: "2026-10-19", time: "08:00" };
  expect(toggleTarget(dose)).toBe(toggleTarget({ ...dose }));
  expect(toggleTarget(dose)).not.toBe(toggleTarget({ ...dose, time: "20:00" }));
  expect(toggleTarget({ kind: "buy.toggle", itemId: "i1" })).toBe("buy|i1");
  // A chore answered for two days is two changes, not one.
  expect(toggleTarget({ kind: "chore.log" })).toBeNull();
});

test("the offline line says what waits, page by page", () => {
  expect(offlineLine("/today")).toMatch(/wait here/);
  expect(offlineLine("/chat/household")).toMatch(/wait here/);
  // Chores and doses queue there now; nothing else on those pages does.
  expect(offlineLine("/planner")).toMatch(/chores and medicine ticks wait here.*Other changes won’t save/);
  expect(offlineLine("/family/members/6f1c2b9e-0000-4000-a000-000000000001")).toMatch(/medicine ticks wait here/);
  expect(offlineLine("/wealth")).toBe("Offline — changes on this screen won’t save.");
  expect(offlineLine("/planner/alkansya/x")).toBe("Offline — changes on this screen won’t save.");
});
