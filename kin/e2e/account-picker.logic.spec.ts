import { test, expect } from "@playwright/test";
import { accountPickerGroups, sortByUse, toPickable, FLAT_UP_TO } from "@/lib/account-picker";

/** The account pickers: most used first; joint and mine apart once the list
 * is long; ₱0 accounts nothing has touched at the end, under their own
 * heading, never hidden. */

const ME = "member-quinn";

const src = (id: string, over: Partial<Parameters<typeof toPickable>[0][number]> = {}) => ({
  id,
  name: id,
  institution: null,
  linked_app_url: null,
  balance: 100,
  is_joint: true,
  account_type: "bank",
  owner_member_id: null,
  movementCount: 0,
  ...over,
});

const acc = (name: string, over: { balance?: number; is_joint?: boolean; movementCount?: number } = {}) => ({
  name,
  balance: 100,
  is_joint: true,
  movementCount: 0,
  ...over,
});

test("toPickable says which accounts are the viewer's Only-you ones", () => {
  const picked = toPickable(
    [
      src("mine-private", { owner_member_id: "me", is_joint: false, is_private: true }),
      src("mine-shared", { owner_member_id: "me", is_joint: false, is_private: true, shared: true }),
      src("mine-open", { owner_member_id: "me", is_joint: false, is_private: false }),
      src("joint", { is_joint: true, is_private: false }),
    ],
    "me",
  );
  expect(Object.fromEntries(picked.map((a) => [a.id, a.onlyMe]))).toEqual({ "mine-private": true, "mine-shared": false, "mine-open": false, joint: false });
});

test("toPickable keeps joint accounts and the viewer's own, and carries how often each was used", () => {
  const out = toPickable([src("joint"), src("mine", { is_joint: false, owner_member_id: ME, movementCount: 7 }), src("theirs", { is_joint: false, owner_member_id: "member-pat" })], ME);
  expect(out.map((a) => a.id)).toEqual(["joint", "mine"]);
  expect(out[1].movementCount).toBe(7);
  expect(out[1].account_type).toBe("bank");
});

test("toPickable with everyone keeps the shared-with-you accounts too", () => {
  const out = toPickable([src("joint"), src("theirs", { is_joint: false, owner_member_id: "member-pat" })], ME, { everyone: true });
  expect(out.map((a) => a.id)).toEqual(["joint", "theirs"]);
});

test("most used comes first, ties by name", () => {
  const out = sortByUse([acc("GCash", { movementCount: 2 }), acc("BPI", { movementCount: 9 }), acc("Maya", { movementCount: 2 })]);
  expect(out.map((a) => a.name)).toEqual(["BPI", "GCash", "Maya"]);
});

test("a short list stays one plain list, sorted", () => {
  const groups = accountPickerGroups([acc("GCash", { movementCount: 1 }), acc("BPI", { movementCount: 5, is_joint: false }), acc("Wallet", { balance: 0 })]);
  expect(groups).toHaveLength(1);
  expect(groups[0].label).toBeNull();
  expect(groups[0].accounts.map((a) => a.name)).toEqual(["BPI", "GCash", "Wallet"]);
  expect(groups[0].accounts.length).toBe(FLAT_UP_TO);
});

test("a long list splits into Joint, Mine and Not used yet, most used first inside each", () => {
  const groups = accountPickerGroups([
    acc("Joint checking", { movementCount: 20 }),
    acc("E2E wallet 1", { balance: 0 }),
    acc("BDO Savings", { is_joint: false, movementCount: 3 }),
    acc("GCash", { is_joint: false, movementCount: 11 }),
    acc("E2E wallet 2", { balance: 0 }),
    acc("House fund", { movementCount: 1 }),
  ]);
  expect(groups.map((g) => g.label)).toEqual(["Joint", "Mine", "Not used yet"]);
  expect(groups[0].accounts.map((a) => a.name)).toEqual(["Joint checking", "House fund"]);
  expect(groups[1].accounts.map((a) => a.name)).toEqual(["GCash", "BDO Savings"]);
  expect(groups[2].accounts.map((a) => a.name)).toEqual(["E2E wallet 1", "E2E wallet 2"]);
});

test("a ₱0 account that has been used is in use, not unused; one never used but holding money is in use too", () => {
  const groups = accountPickerGroups([acc("A", { balance: 0, movementCount: 4 }), acc("B", { balance: 50 }), acc("C", { balance: 0 }), acc("D", { balance: 0 })]);
  expect(groups.map((g) => g.label)).toEqual(["In use", "Not used yet"]);
  expect(groups[0].accounts.map((a) => a.name)).toEqual(["A", "B"]);
  expect(groups[1].accounts.map((a) => a.name)).toEqual(["C", "D"]);
});

test("all joint and all in use on a long list means no headings at all", () => {
  const groups = accountPickerGroups([acc("A"), acc("B"), acc("C"), acc("D")]);
  expect(groups).toHaveLength(1);
  expect(groups[0].label).toBeNull();
});

test("nothing in, nothing out", () => {
  expect(accountPickerGroups([])).toEqual([]);
});
