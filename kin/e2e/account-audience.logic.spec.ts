import { test, expect } from "@playwright/test";
import { accountAudienceLabel } from "@/lib/wealth";

/** Who can see an account, in the chip's words (12 October). */
const people = [
  { id: "wife", label: "Janine", grownUp: true },
  { id: "kid1", label: "Ana", grownUp: false },
  { id: "kid2", label: "Ben", grownUp: false },
];
const mine = (is_private: boolean) => ({ is_joint: false, is_private, owner_member_id: "me" });

test("all grown-ups, only you, joint", () => {
  expect(accountAudienceLabel(mine(false), [], people, "me")).toBe("Grown-ups");
  expect(accountAudienceLabel(mine(true), [], people, "me")).toBe("Only you");
  expect(accountAudienceLabel({ is_joint: true, is_private: false, owner_member_id: null }, [], people, "me")).toBe("Joint");
});

test("people picked by name; every grown-up and no child reads as Grown-ups", () => {
  expect(accountAudienceLabel(mine(true), ["wife"], people, "me")).toBe("Grown-ups");
  expect(accountAudienceLabel(mine(true), ["kid1"], people, "me")).toBe("You + Ana");
  expect(accountAudienceLabel(mine(true), ["wife", "kid1", "kid2"], people, "me")).toBe("You + 3 people");
});

test("seen from someone it is shared with", () => {
  expect(accountAudienceLabel({ is_joint: false, is_private: true, owner_member_id: "husband" }, ["me"], people, "me")).toBe("Shared with you");
});
