import { test, expect } from "@playwright/test";
import { pendingRows, pendingBriefItems, isTransferWords } from "@/lib/wealth";

/** Accounts' "Waiting on you" (27 October): a transfer is one row, not
 * its two legs; a single pending entry is its own row; newest first. */

const leg = (over: Partial<Parameters<typeof pendingRows>[0][number]>) => ({
  id: "t1",
  transfer_group_id: null,
  direction: "out",
  amount: 5000,
  occurred_at: "2026-10-30T02:00:00.000Z",
  particulars: "Transfer to Travel Fund",
  account_id: "payroll",
  accountName: "Payroll",
  ...over,
});

test("a transfer's two legs fold into one row with both sides", () => {
  const rows = pendingRows([
    leg({ id: "a", transfer_group_id: "g1", direction: "out", account_id: "payroll", accountName: "Payroll", particulars: "Transfer to Travel Fund" }),
    leg({ id: "b", transfer_group_id: "g1", direction: "in", account_id: "travel", accountName: "Travel Fund", particulars: "Transfer from Payroll" }),
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: "g1", kind: "transfer", amount: 5000, occurredOn: "2026-10-30", from: { id: "payroll", name: "Payroll" }, to: { id: "travel", name: "Travel Fund" }, account: null, defaultWords: true });
  expect(["a", "b"]).toContain(rows[0].entryId);
});

test("a leg the viewer cannot see leaves that side empty; a typed note is kept", () => {
  const rows = pendingRows([leg({ id: "a", transfer_group_id: "g1", direction: "in", account_id: "mp2", accountName: "MP2 Keira", particulars: "October top-up" })]);
  expect(rows[0]).toMatchObject({ kind: "transfer", from: null, to: { id: "mp2", name: "MP2 Keira" }, defaultWords: false, particulars: "October top-up" });
});

test("single entries are their own rows, newest first", () => {
  const rows = pendingRows([
    leg({ id: "x", direction: "out", occurred_at: "2026-10-28T02:00:00.000Z", particulars: "Meralco", account_id: "gcash", accountName: "GCash" }),
    leg({ id: "y", direction: "in", occurred_at: "2026-10-29T02:00:00.000Z", particulars: "Salary", amount: 44500 }),
  ]);
  expect(rows.map((r) => [r.id, r.kind, r.amount, r.account?.name])).toEqual([
    ["y", "in", 44500, "Payroll"],
    ["x", "out", 5000, "GCash"],
  ]);
});

test("Today's rows: one per transfer or entry, Confirm opening its sheet under Accounts", () => {
  const rows = pendingRows([
    leg({ id: "a", transfer_group_id: "g1", direction: "out", account_id: "payroll", accountName: "Payroll" }),
    leg({ id: "b", transfer_group_id: "g1", direction: "in", account_id: "travel", accountName: "Travel Fund", particulars: "Transfer from Payroll" }),
    leg({ id: "x", direction: "out", occurred_at: "2026-10-29T02:00:00.000Z", particulars: "Meralco", account_id: "gcash", accountName: "GCash", amount: 2367 }),
  ]);
  expect(pendingBriefItems(rows, "PHP")).toEqual([
    { id: "pending-g1", title: "Payroll → Travel Fund", meta: "₱5,000 · transfer · waiting on confirmation", href: "/wealth?seg=accounts&pending=g1" },
    { id: "pending-x", title: "Meralco", meta: "₱2,367 · from GCash · waiting on confirmation", href: "/wealth?seg=accounts&pending=x" },
  ]);
});

test("isTransferWords knows Kin's own wording", () => {
  expect(isTransferWords("Transfer to BPI")).toBe(true);
  expect(isTransferWords("Transfer from BPI")).toBe(true);
  expect(isTransferWords("Travel money")).toBe(false);
});
