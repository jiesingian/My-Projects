import { test, expect } from "@playwright/test";
import { catchUpOffers, hasNextBill, nextBillDate, nextBillOffer, type RollableBill } from "@/lib/bill-roll";

/** A repeating bill's next one (lib/bill-roll.ts): the date Kin offers, and
 * when it offers nothing. */
test.describe("nextBillDate", () => {
  test("monthly: one month on", () => {
    expect(nextBillDate("2026-10-15", "monthly", "2026-10-10")).toBe("2026-11-15");
  });
  test("a 31st is the month's last day where there is no 31st", () => {
    expect(nextBillDate("2026-10-31", "monthly", "2026-10-31")).toBe("2026-11-30");
    expect(nextBillDate("2027-01-31", "monthly", "2027-01-31")).toBe("2027-02-28");
    expect(nextBillDate("2028-01-31", "monthly", "2028-01-31")).toBe("2028-02-29");
  });
  test("counted from the first day, so the 31st comes back", () => {
    // Paid 31 January, the next three months later: 30 April, then 31 May.
    expect(nextBillDate("2027-01-31", "monthly", "2027-04-10")).toBe("2027-03-31");
    expect(nextBillDate("2027-01-31", "monthly", "2027-05-01")).toBe("2027-04-30");
  });
  test("quarterly and yearly", () => {
    expect(nextBillDate("2026-11-30", "quarterly", "2026-11-01")).toBe("2027-02-28");
    expect(nextBillDate("2026-03-01", "yearly", "2026-03-01")).toBe("2027-03-01");
    expect(nextBillDate("2028-02-29", "yearly", "2028-02-29")).toBe("2029-02-28");
  });
  test("a late payment keeps this period's bill, still owed", () => {
    // September's bill paid 21 October: October's (the 15th) is offered.
    expect(nextBillDate("2026-09-15", "monthly", "2026-10-21")).toBe("2026-10-15");
  });
  test("periods wholly gone are skipped", () => {
    expect(nextBillDate("2026-07-15", "monthly", "2026-10-21")).toBe("2026-10-15");
    expect(nextBillDate("2026-07-15", "monthly", "2026-11-15")).toBe("2026-11-15");
  });
  test("nothing for a one-off, an unknown repeat or no date", () => {
    expect(nextBillDate("2026-10-15", "once", "2026-10-15")).toBeNull();
    expect(nextBillDate("2026-10-15", "weekly", "2026-10-15")).toBeNull();
    expect(nextBillDate(null, "monthly", "2026-10-15")).toBeNull();
  });
});

const bill = (o: Partial<RollableBill>): RollableBill => ({ id: "a", name: "Meralco", amount: 3200, due_date: "2026-10-15", recurrence: "monthly", status: "paid", ...o });

test.describe("offers", () => {
  test("a paid repeating bill with no next one is offered, amount prefilled", () => {
    const b = bill({});
    expect(nextBillOffer(b, [b], "2026-10-16")).toEqual({ billId: "a", name: "Meralco", amount: 3200, dueDate: "2026-11-15", repeat: "monthly" });
  });
  test("not when the next one exists: open, or due later", () => {
    const b = bill({});
    const open = bill({ id: "b", status: "unpaid", due_date: "2026-11-15" });
    const laterPaid = bill({ id: "c", name: " meralco ", due_date: "2026-11-15" });
    expect(hasNextBill(b, [b, open])).toBe(true);
    expect(nextBillOffer(b, [b, laterPaid], "2026-10-16")).toBeNull();
  });
  test("an earlier paid one or another repeat is not the next one", () => {
    const b = bill({});
    expect(hasNextBill(b, [b, bill({ id: "d", due_date: "2026-09-15" })])).toBe(false);
    expect(hasNextBill(b, [b, bill({ id: "e", recurrence: "yearly", status: "unpaid" })])).toBe(false);
  });
  test("not for an unpaid bill or a one-off", () => {
    expect(nextBillOffer(bill({ status: "unpaid" }), [], "2026-10-16")).toBeNull();
    expect(nextBillOffer(bill({ recurrence: "once" }), [], "2026-10-16")).toBeNull();
  });
  test("catching up offers only the latest of each, soonest first", () => {
    const all = [
      bill({ id: "s", due_date: "2026-09-15" }),
      bill({ id: "o", due_date: "2026-10-15" }),
      bill({ id: "w", name: "Water", due_date: "2026-10-05" }),
      bill({ id: "x", name: "Rent", recurrence: "once" }),
    ];
    expect(catchUpOffers(all, "2026-10-21").map((o) => [o.billId, o.dueDate])).toEqual([
      ["w", "2026-11-05"],
      ["o", "2026-11-15"],
    ]);
  });
});
