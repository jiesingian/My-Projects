import { test, expect } from "@playwright/test";
import { potBalances, settleUp, shareLabel, splitByShare } from "@/lib/shared-costs";

/** Shared costs between linked households, without a browser or a
 * database: each household's share, who owes whom, and the fewest payments
 * that settle it. */

const A = { familyId: "a", name: "Ana's", share: 1 };
const B = { familyId: "b", name: "Ben's", share: 1 };
const C = { familyId: "c", name: "Cora's", share: 1 };

test("splitByShare always adds back up to the total", () => {
  expect(splitByShare(100000, [1, 1, 1])).toEqual([33334, 33333, 33333]);
  expect(splitByShare(100, [2, 1])).toEqual([67, 33]);
  expect(splitByShare(0, [1, 1])).toEqual([0, 0]);
  expect(splitByShare(500, [0, 0])).toEqual([0, 0]);
});

test("two siblings, half each: one paid the medicines, the other owes half", () => {
  const b = potBalances([A, B], [{ kind: "cost", familyId: "a", toFamilyId: null, amount: 3000 }]);
  expect(b).toEqual([
    { familyId: "a", name: "Ana's", paid: 3000, fairShare: 1500, net: 1500 },
    { familyId: "b", name: "Ben's", paid: 0, fairShare: 1500, net: -1500 },
  ]);
  expect(settleUp(b)).toEqual([{ fromFamilyId: "b", fromName: "Ben's", toFamilyId: "a", toName: "Ana's", amount: 1500 }]);
});

test("a recorded payment settles it, and a part payment leaves the rest", () => {
  const cost = { kind: "cost" as const, familyId: "a", toFamilyId: null, amount: 3000 };
  const part = potBalances([A, B], [cost, { kind: "payment", familyId: "b", toFamilyId: "a", amount: 1000 }]);
  expect(part.map((x) => x.net)).toEqual([500, -500]);
  const full = potBalances([A, B], [cost, { kind: "payment", familyId: "b", toFamilyId: "a", amount: 1500 }]);
  expect(full.map((x) => x.net)).toEqual([0, 0]);
  expect(settleUp(full)).toEqual([]);
});

test("three households, uneven shares, costs on both sides", () => {
  const b = potBalances(
    [A, { ...B, share: 2 }, C],
    [
      { kind: "cost", familyId: "a", toFamilyId: null, amount: 4000 },
      { kind: "cost", familyId: "c", toFamilyId: null, amount: 4000 },
    ],
  );
  // 8,000 in all: Ana 2,000, Ben 4,000, Cora 2,000.
  expect(b.map((x) => x.fairShare)).toEqual([2000, 4000, 2000]);
  expect(b.map((x) => x.net)).toEqual([2000, -4000, 2000]);
  expect(b.reduce((s, x) => s + x.net, 0)).toBe(0);
  expect(settleUp(b).map((s) => [s.fromFamilyId, s.toFamilyId, s.amount])).toEqual([
    ["b", "a", 2000],
    ["b", "c", 2000],
  ]);
});

test("a ₱1,000 cost split three ways leaves no stray centavo", () => {
  const b = potBalances([A, B, C], [{ kind: "cost", familyId: "a", toFamilyId: null, amount: 1000 }]);
  expect(b.map((x) => x.fairShare)).toEqual([333.34, 333.33, 333.33]);
  expect(Math.round(b.reduce((s, x) => s + x.net, 0) * 100)).toBe(0);
  expect(settleUp(b).reduce((s, x) => s + x.amount, 0)).toBeCloseTo(666.66, 2);
});

test("entries from a household no longer in the pot, and odd payments, are ignored", () => {
  const b = potBalances(
    [A, B],
    [
      { kind: "cost", familyId: "z", toFamilyId: null, amount: 900 },
      { kind: "payment", familyId: "a", toFamilyId: "a", amount: 50 },
      { kind: "payment", familyId: "a", toFamilyId: null, amount: 50 },
    ],
  );
  expect(b.map((x) => x.net)).toEqual([0, 0]);
});

test("shareLabel says equal shares in words", () => {
  expect(shareLabel(1, [1, 1])).toBe("half");
  expect(shareLabel(1, [1, 1, 1])).toBe("a third");
  expect(shareLabel(2, [2, 1, 1])).toBe("50%");
});
