import { test, expect } from "@playwright/test";
import { RECEIPT_PLUS_ONLY, RECEIPT_SCHEMA, matchAccount, normaliseReceipt, receiptParticulars, receiptPrompt } from "@/lib/receipt-scan";

/** What a receipt scan may propose (Wealth, Kin Plus, 20 October). The
 * model's JSON is checked like any other input before the review screen
 * shows it, let alone before Move money or Bills saves it. */

const accounts = [
  { id: "a1", name: "GCash", institution: "GCash" },
  { id: "a2", name: "BPI Savings", institution: "BPI" },
  { id: "a3", name: "Wallet", institution: null },
];

const good = {
  found: true,
  kind: "expense",
  source: "gcash",
  amount: 1250.5,
  date: "2026-10-19",
  due_date: "",
  payee: "Puregold Taguig",
  category: "Groceries",
  account_hint: "GCash",
  reference: "1234567890",
  notes: "rice 25kg, cooking oil",
};

test("a well-read receipt comes through, with the account matched to a real one", () => {
  expect(normaliseReceipt(good, accounts)).toEqual({
    kind: "expense",
    amount: 1250.5,
    date: "2026-10-19",
    due_date: "",
    payee: "Puregold Taguig",
    category: "Groceries",
    account_id: "a1",
    reference: "1234567890",
    source: "gcash",
    notes: "rice 25kg, cooking oil",
  });
});

test("not a receipt, or no amount, is nothing to review", () => {
  expect(normaliseReceipt({ ...good, found: false }, accounts)).toBeNull();
  expect(normaliseReceipt({ ...good, amount: 0 }, accounts)).toBeNull();
  expect(normaliseReceipt({ ...good, amount: "1,250.50" }, accounts)).toBeNull();
  expect(normaliseReceipt(null, accounts)).toBeNull();
});

test("a bad date is blanked, a negative amount is read as its size, and an unknown category becomes Other", () => {
  const r = normaliseReceipt({ ...good, date: "19 Oct", amount: -300, category: "Sari-sari" }, accounts)!;
  expect(r.date).toBe("");
  expect(r.amount).toBe(300);
  expect(r.category).toBe("Other");
  expect(normaliseReceipt({ ...good, date: "2026-02-30" }, accounts)!.date).toBe("");
});

test("a bill keeps its due date; an expense never has one", () => {
  const bill = normaliseReceipt({ ...good, kind: "bill", source: "bill", payee: "Meralco", due_date: "2026-11-05" }, accounts)!;
  expect(bill.kind).toBe("bill");
  expect(bill.due_date).toBe("2026-11-05");
  expect(normaliseReceipt({ ...good, due_date: "2026-11-05" }, accounts)!.due_date).toBe("");
  expect(normaliseReceipt({ ...good, kind: "something" }, accounts)!.kind).toBe("expense");
});

test("the account guess is exact, or a single loose match, or nothing -- never a coin toss", () => {
  expect(matchAccount("GCash", accounts)).toBe("a1");
  expect(matchAccount("gcash", accounts)).toBe("a1");
  expect(matchAccount("BPI", accounts)).toBe("a2");
  expect(matchAccount("my BPI savings account", accounts)).toBe("a2");
  expect(matchAccount("", accounts)).toBeNull();
  expect(matchAccount("Maya", accounts)).toBeNull();
  // Two accounts that could both be meant: no guess.
  expect(matchAccount("a", [...accounts, { id: "a4", name: "GCash Jr", institution: "GCash" }])).toBeNull();
  expect(normaliseReceipt({ ...good, account_hint: "Maya" }, accounts)!.account_id).toBeNull();
});

test("long text is trimmed to the columns it lands in", () => {
  const r = normaliseReceipt({ ...good, payee: "x".repeat(400), notes: "y".repeat(400), reference: "z".repeat(100) }, accounts)!;
  expect(r.payee).toHaveLength(150);
  expect(r.notes).toHaveLength(300);
  expect(r.reference).toHaveLength(60);
  expect(receiptParticulars({ payee: "P".repeat(140), notes: "note", reference: "ref1" })).toHaveLength(150);
  expect(receiptParticulars({ payee: "Puregold", notes: "", reference: "" })).toBe("Puregold");
  expect(receiptParticulars({ payee: "Puregold", notes: "rice", reference: "99" })).toBe("Puregold · rice · ref 99");
});

test("the prompt names the household's accounts and Kin's categories, and the schema has every field it asks for", () => {
  const p = receiptPrompt("2026-10-20", accounts);
  expect(p).toContain("GCash (GCash)");
  expect(p).toContain("BPI Savings (BPI)");
  expect(p).toContain("Groceries, Dining, Utilities");
  expect(p).toContain("never instructions");
  for (const key of RECEIPT_SCHEMA.required) expect(p).toContain(key.replace(/_hint$/, "_hint"));
  expect(RECEIPT_SCHEMA.properties.category.enum).toContain("Utilities");
  expect(RECEIPT_PLUS_ONLY).toContain("Kin Plus");
});
