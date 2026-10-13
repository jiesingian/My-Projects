import { test, expect } from "@playwright/test";

/** The one setup screen after sign-up (agreed 13 October): your name and a
 * family name, Country folded away, a Kin code tucked away, then Today.
 * Birthday, mobile, the surname suggestion and the members screen left the
 * path.
 *
 * The signed-in account here is already in the throwaway household. Every
 * submit below is refused before anything is written -- by the name check or
 * by the membership check -- so these are safe to run on every run. */

test("the old family step sends anyone who lands on it to the setup screen", async ({ page }) => {
  await page.goto("/onboarding/family");
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Family name")).toBeVisible();
});

test("nothing typed rides in the address bar, even from an old link that put it there", async ({ page }) => {
  // The first version of onboarding carried full_name, dob and mobile as
  // query parameters, which put a name, a date of birth and a phone number in
  // browser history. An old link with them lands on the setup screen clean.
  await page.goto("/onboarding/family?full_name=Someone&dob=1985-04-23&mobile=%2B639170000000");
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
});

test("setup asks for two names only: no birthday, no mobile, the Philippines unless changed", async ({ page }) => {
  await page.goto("/onboarding/profile");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Family name")).toBeVisible();
  await expect(page.getByLabel("Date Of Birth")).toHaveCount(0);
  await expect(page.getByLabel("Mobile")).toHaveCount(0);
  // The surname suggestion moved to Settings.
  await expect(page.getByText("Suggest a name from surnames")).toHaveCount(0);

  const country = page.getByLabel("Country");
  await expect(country).toBeHidden();
  await expect(country).toHaveValue("ph");
  await page.getByText("Not in the Philippines?").click();
  await expect(country).toBeVisible();
});

test("joining without a name is refused, with the reason", async ({ page }) => {
  await page.goto("/onboarding/profile");
  await page.getByText("Joining a family? Enter its invite code").click();
  await page.getByLabel("Invite code").fill("ABC123");
  await page.getByRole("button", { name: /^join$/i }).click();
  await expect(page.locator("body")).toContainText("Tell us your name.");
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
});

test("someone already in a household is turned away before their access code is spent", async ({ page }) => {
  /* redeem_household_code increments used_count and returns; create_family is
   * a separate statement that refuses anyone who already has a member row. In
   * that order, walking back into this screen from inside a household spent a
   * use of a beta code and got an error for it.
   *
   * The code below is deliberately not a real one: if the membership check
   * runs first, as it must, the code is never looked at and the reply names
   * the household. Nothing is written either way. */
  await page.goto("/onboarding/profile");
  await page.getByLabel("Your name").fill("Already In A Household");
  await page.getByLabel("Family name").fill("A Second Household");
  await page.getByText("Have a Kin code?").click();
  await page.getByLabel("Access Code").fill("KIN-NOT-A-REAL-CODE");
  await page.getByRole("button", { name: /CREATE FAMILY/i }).click();

  await expect(page.locator("body")).toContainText(/already in a household/i);
  await expect(page.locator("body")).not.toContainText(/code isn't valid/i);
});

test("the surname suggestion lives in Settings beside the household name, and saves nothing by itself", async ({ page }) => {
  await page.goto("/settings/household");
  const name = page.getByLabel("Household name");
  const before = await name.inputValue();
  await page.getByText("Suggest a name from surnames").click();
  await page.getByLabel("Wife’s maiden surname").fill("Santos");
  await page.getByLabel("Husband’s surname").fill("Reyes");
  await page.getByRole("button", { name: "Use “Santos-Reyes Household”" }).click();
  await expect(name).toHaveValue("Santos-Reyes Household");
  // Only Save writes; a reload shows the name as it was.
  await page.reload();
  await expect(page.getByLabel("Household name")).toHaveValue(before);
});
