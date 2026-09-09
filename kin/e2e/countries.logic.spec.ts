import { test, expect } from "@playwright/test";
import { COUNTRIES, DEFAULT_COUNTRY, isCountryCode, countryLabel } from "@/lib/countries";

test("DEFAULT_COUNTRY is itself a real entry in COUNTRIES", () => {
  // Onboarding's select defaultValue is DEFAULT_COUNTRY -- if it ever drifted
  // from the list itself, the form would silently submit a country nothing
  // recognizes, and updateHouseholdPrefsAction/createFamilyAction would both
  // reject it.
  expect(isCountryCode(DEFAULT_COUNTRY)).toBe(true);
});

test("isCountryCode only accepts a real code from the list", () => {
  for (const c of COUNTRIES) {
    expect(isCountryCode(c.code)).toBe(true);
  }
  expect(isCountryCode("xx")).toBe(false);
  expect(isCountryCode("")).toBe(false);
  expect(isCountryCode("Philippines")).toBe(false);
});

test("countryLabel resolves a known code and falls back to the code itself", () => {
  expect(countryLabel("ph")).toBe("Philippines");
  // A code this list doesn't have yet shouldn't crash the settings page --
  // it should just show something, not throw.
  expect(countryLabel("zz")).toBe("zz");
});
