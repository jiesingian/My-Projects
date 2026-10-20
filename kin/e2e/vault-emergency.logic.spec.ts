import { test, expect } from "@playwright/test";
import {
  WAIT_DAYS,
  DEFAULT_WAIT,
  isWaitDays,
  asStatus,
  reasonProblem,
  shortWhen,
  openedLine,
  householdPhrase,
  ownerStatusLine,
  trustedStatusLine,
  emergencyError,
  SHARE_IN_EMERGENCY_HINT,
} from "@/lib/vault-emergency";

/** Emergency access to the vault: the words around what the database decides
 * (20261015120000). Who may do what is proved in PGlite
 * (supabase/tests/pglite/probes/vault-emergency-access.mjs). */

const MANILA = "Asia/Manila";
// 12 November 2026, 15:40 in Manila.
const at = new Date("2026-11-12T07:40:00Z");

test("the wait is 1, 3 or 7 days, 3 unless chosen", () => {
  expect([...WAIT_DAYS]).toEqual([1, 3, 7]);
  expect(DEFAULT_WAIT).toBe(3);
  expect(isWaitDays(3)).toBe(true);
  expect(isWaitDays(2)).toBe(false);
  expect(isWaitDays(30)).toBe(false);
});

test("a status the page does not know reads as ended, never as open", () => {
  expect(asStatus("open")).toBe("open");
  expect(asStatus("waiting")).toBe("waiting");
  expect(asStatus("something-new")).toBe("expired");
  expect(asStatus("")).toBe("expired");
});

test("a reason is required, and short", () => {
  expect(reasonProblem("")).toBeTruthy();
  expect(reasonProblem("  hi ")).toBeTruthy();
  expect(reasonProblem("Ate is in the ICU")).toBeNull();
  expect(reasonProblem("x".repeat(301))).toBeTruthy();
});

test("times read in the household's zone, the way the log shows them", () => {
  expect(shortWhen(at, MANILA)).toBe("12 Nov 3:40 pm");
  expect(shortWhen(at, "Asia/Dubai")).toBe("12 Nov 11:40 am");
  expect(openedLine("Ate Liza", "Passport (Mia)", at, MANILA)).toBe("Ate Liza opened Passport (Mia), 12 Nov 3:40 pm");
});

test("a household's name reads as a household", () => {
  expect(householdPhrase("Santos")).toBe("the Santos household");
  expect(householdPhrase("Santos Family")).toBe("the Santos Family");
  expect(householdPhrase("Reyes household")).toBe("the Reyes household");
  expect(householdPhrase(" ")).toBe("their household");
});

test("each state says what it means, to either side", () => {
  const opensAt = at;
  const endsAt = new Date(at.getTime() + 30 * 86_400_000);
  expect(ownerStatusLine({ status: "waiting", opensAt, endsAt, answeredBy: null }, MANILA)).toBe("Opens 12 Nov 3:40 pm unless a grown-up here says no.");
  expect(ownerStatusLine({ status: "open", opensAt, endsAt, answeredBy: null }, MANILA)).toContain("12 Dec 3:40 pm");
  expect(ownerStatusLine({ status: "denied", opensAt, endsAt, answeredBy: "Ann" }, MANILA)).toBe("Denied by Ann.");
  expect(ownerStatusLine({ status: "revoked", opensAt, endsAt, answeredBy: null }, MANILA)).toBe("Ended.");
  expect(trustedStatusLine({ status: "waiting", opensAt, endsAt }, MANILA)).toContain("if nobody there says no");
  expect(trustedStatusLine({ status: "open", opensAt, endsAt }, MANILA)).toContain("Each item you open is shown to them");
  expect(trustedStatusLine({ status: "expired", opensAt, endsAt }, MANILA)).toContain("Ask again");
});

test("the database's refusals become sentences, and unknown ones never leak", () => {
  expect(emergencyError("kin_plus_required: The vault is part of Kin Plus")).toBe("Naming someone is part of Kin Plus.");
  expect(emergencyError("One request a day")).toContain("tomorrow");
  expect(emergencyError("That household has not named you")).toBe("That household has not named you.");
  // Within the household since 20261020170000.
  expect(emergencyError("That person cannot be named: only another grown-up of this household with Kin")).toBe("Only another grown-up of this household with Kin can be named.");
  expect(emergencyError("You are no longer in this household")).toBe("You are no longer in that household.");
  expect(emergencyError('relation "x" does not exist')).toBe("That didn't work. Try again in a moment.");
});

test("the hint under Parents only says what the tick does, and that it is off otherwise", () => {
  expect(SHARE_IN_EMERGENCY_HINT).toMatch(/left out of emergency access unless/);
  expect(SHARE_IN_EMERGENCY_HINT).toMatch(/grown-up of this household/);
});
