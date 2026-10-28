import { test, expect } from "@playwright/test";
import { moneyIds, moneyVerdict, offlineLine, toggleTarget } from "@/lib/offline/rules";

/** Money saved on Move money with no signal (28 October): Safari's "Load
 * failed" lost five entries in production in a week. Now they wait on the
 * phone, and the one rule that matters is that money is never recorded
 * twice -- not by a replay sent again, nor after a save whose answer was
 * lost on the way back. */

const out = "11111111-1111-4111-8111-111111111111";
const inn = "22222222-2222-4222-8222-222222222222";
const record = { kind: "money.record", id: out };
const transfer = { kind: "money.transfer", id: out, inId: inn };

test("an entry made offline is recorded when nothing with its id is there yet", () => {
  expect(moneyVerdict(record, [])).toEqual({ apply: true });
  expect(moneyVerdict(transfer, [])).toEqual({ apply: true });
  // Someone else's row is not this one.
  expect(moneyVerdict(record, ["33333333-3333-4333-8333-333333333333"])).toEqual({ apply: true });
});

test("an entry already recorded, by an earlier send or a save whose answer was lost, is not recorded again", () => {
  expect(moneyVerdict(record, [out])).toEqual({ apply: false, outcome: "applied" });
  // Either leg of a transfer is enough: both went in one statement.
  expect(moneyVerdict(transfer, [out])).toEqual({ apply: false, outcome: "applied" });
  expect(moneyVerdict(transfer, [inn])).toEqual({ apply: false, outcome: "applied" });
});

test("a transfer is checked by both its legs, an entry by its own id", () => {
  expect(moneyIds(record)).toEqual([out]);
  expect(moneyIds(transfer)).toEqual([out, inn]);
});

test("two entries are two entries: the queue never folds one money change into another", () => {
  expect(toggleTarget({ kind: "money.record" })).toBeNull();
  expect(toggleTarget({ kind: "money.transfer" })).toBeNull();
});

test("Move money says offline that entries wait, and that a banking app needs a signal", () => {
  expect(offlineLine("/wealth/transact")).toMatch(/wait here/);
  expect(offlineLine("/wealth/transact")).toMatch(/banking app need a signal/);
  expect(offlineLine("/wealth")).toBe("Offline — changes on this screen won’t save.");
});
