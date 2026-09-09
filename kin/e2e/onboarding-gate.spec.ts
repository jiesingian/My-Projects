import { test, expect } from "@playwright/test";

/** Step 4 of onboarding, reached without step 3.
 *
 * `/onboarding/family` has no fields for the person signing up -- their name,
 * birthday and mobile come from the previous screen and travel in hidden
 * inputs. Arriving here without them used to render the form anyway, so
 * filling in the household name and pressing CREATE HOUSEHOLD answered
 * "Household name and your name are required" while pointing at no field
 * asking for a name. Nothing on the page could clear it. It is reachable by
 * a bookmark, a shared link, a back button, or simply coming back later.
 *
 * These read pages and follow redirects. Nothing is written, so they are safe
 * to run against the throwaway household on every run.
 */

test("arriving at the family step with nothing carried forward goes back a step", async ({ page }) => {
  await page.goto("/onboarding/family");
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
  // And the screen it lands on is the one that asks for the missing thing.
  await expect(page.getByLabel("Full Name")).toBeVisible();
});

test("the profile no longer travels in the URL", async ({ page }) => {
  // The old route carried full_name, dob and mobile as query parameters, which
  // put a name, a date of birth and a phone number in the address bar and in
  // browser history. Passing them now proves nothing: the page reads the
  // cookie, finds none, and sends the visitor back to fill the form in.
  await page.goto("/onboarding/family?full_name=Someone&dob=1985-04-23&mobile=%2B639170000000");
  await expect(page).toHaveURL(/\/onboarding\/profile$/);
});

test("the profile step submits without putting what was typed in the address bar", async ({ page }) => {
  await page.goto("/onboarding/profile");
  await page.getByLabel("Full Name").fill("Wilhelmina Featherstonehaugh");
  await page.getByLabel("Mobile").fill("+63 917 555 0000");
  await page.getByRole("button", { name: /CONTINUE/i }).click();

  await page.waitForURL((url) => new URL(url).pathname !== "/onboarding/profile", { timeout: 30_000 });
  const url = new URL(page.url());
  expect(url.pathname, "the profile step should hand off to the family step").toBe("/onboarding/family");
  expect(url.search, "nothing the member typed belongs in the URL").toBe("");
  // Carried forward all the same -- the hidden field the next step posts.
  // Both forms on that page carry it, create and join, so both are checked;
  // one of them silently losing the name is the bug above coming back.
  const carried = page.locator('input[name="full_name"]');
  await expect(carried).toHaveCount(2);
  for (const field of await carried.all()) {
    await expect(field).toHaveValue("Wilhelmina Featherstonehaugh");
  }
});

test("someone already in a household is turned away before their access code is spent", async ({ page }) => {
  /* redeem_household_code increments used_count and returns; create_family is
   * a separate statement that refuses anyone who already has a member row. In
   * that order, walking back into this screen from inside a household spent a
   * use of a beta code and got an error for it -- codes are finite and issued
   * by hand, so that is somebody's invite gone with nothing to show.
   *
   * The signed-in account here is already in the throwaway household, which is
   * exactly the case. The code below is deliberately not a real one: if the
   * membership check runs first, as it must, the code is never looked at and
   * the reply names the household. If the redemption ran first, the reply
   * would be about the code instead -- and against a REAL code, a use would
   * be gone. Nothing is written either way.
   */
  await page.goto("/onboarding/profile");
  await page.getByLabel("Full Name").fill("Already In A Household");
  await page.getByRole("button", { name: /CONTINUE/i }).click();
  await page.waitForURL(/\/onboarding\/family$/, { timeout: 30_000 });

  await page.getByLabel("Household Name").fill("A Second Household");
  await page.getByLabel("Access Code").fill("KIN-NOT-A-REAL-CODE");
  await page.getByRole("button", { name: /CREATE HOUSEHOLD/i }).click();

  await expect(page.locator("body")).toContainText(/already in a household/i);
  await expect(page.locator("body")).not.toContainText(/access code isn't valid/i);
});
