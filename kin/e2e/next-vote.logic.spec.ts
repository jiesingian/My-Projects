import { test, expect } from "@playwright/test";
import { NEXT_CHOICES, isNextChoice } from "@/lib/next-vote";

/** "What should Kin do next?" (lib/next-vote, 20261029210000_feature_votes.sql). */

test("the choices are the ones the database accepts, each once, and nothing else passes", () => {
  expect(NEXT_CHOICES.map((c) => c.id)).toEqual(["live_alerts", "phone_app", "group_calls", "school_more", "other"]);
  for (const c of NEXT_CHOICES) expect(isNextChoice(c.id)).toBe(true);
  expect(isNextChoice("free_money")).toBe(false);
});
