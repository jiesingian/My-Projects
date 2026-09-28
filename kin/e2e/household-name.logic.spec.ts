import { test, expect } from "@playwright/test";
import { suggestHouseholdName } from "@/lib/household-name";

test("maiden surname first, then the husband's", () => {
  expect(suggestHouseholdName("Santos", "Reyes")).toBe("Santos-Reyes Household");
});

test("either surname alone still suggests a name", () => {
  expect(suggestHouseholdName("", "Reyes")).toBe("Reyes Household");
  expect(suggestHouseholdName("Santos", "  ")).toBe("Santos Household");
});

test("nothing typed suggests nothing", () => {
  expect(suggestHouseholdName(" ", "")).toBe("");
});

test("spaces are tidied and a repeated surname reads once", () => {
  expect(suggestHouseholdName("  dela  Cruz ", "Reyes")).toBe("dela Cruz-Reyes Household");
  expect(suggestHouseholdName("Reyes", "reyes")).toBe("Reyes Household");
});
