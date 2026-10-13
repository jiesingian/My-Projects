import { test, expect } from "@playwright/test";
import { trialLine } from "@/lib/trial-wording";

/** The trial card's line, by the plan chosen before sign-up (agreed 13
 * October). Same trial for everyone; only the words follow the choice. */

test("starting with Plus: says plainly that nothing is charged unless they subscribe", () => {
  expect(trialLine("plus", 5)).toBe("5 days left to try these free. No card: nothing is charged unless you subscribe yourself.");
});

test("just Kin Free: no selling, and everything stays", () => {
  const line = trialLine("free", 5);
  expect(line).toContain("You chose Kin Free");
  expect(line).not.toMatch(/₱|subscribe/i);
});

test("no plan (an older household, or the check-up skipped) keeps the wording from before", () => {
  expect(trialLine(null, 6)).toBe("6 days left to try these free. Afterwards everything you add stays yours.");
});
