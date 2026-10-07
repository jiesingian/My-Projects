import { test, expect } from "@playwright/test";
import { billRemindDays, BILL_REMIND_DAYS, DEFAULT_BILL_REMIND_DAYS } from "@/lib/wealth";

/** A bill's "remind me" days (20261007100000_bill_reminder_days): whatever a
 * form sends is held to what the database accepts, 1 to 30, and anything
 * else falls back to 3 rather than failing the save. */
test.describe("billRemindDays", () => {
  test("keeps 1 to 30", () => {
    for (const d of BILL_REMIND_DAYS) expect(billRemindDays(String(d))).toBe(d);
    expect(billRemindDays(30)).toBe(30);
  });
  test("anything else is the default, 3", () => {
    expect(DEFAULT_BILL_REMIND_DAYS).toBe(3);
    for (const raw of [null, undefined, "", "abc", 0, -2, 31, 400]) expect(billRemindDays(raw)).toBe(3);
  });
});
