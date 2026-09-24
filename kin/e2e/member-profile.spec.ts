import { test, expect } from "@playwright/test";

/** The member profile page, and what it does NOT offer.
 *
 * Two controls live here that the database will refuse for certain members:
 * changing somebody's role, and turning them into a managed child profile.
 * `members_guard_self_update` raises on both for a row with no login, and on
 * a change to your own role.
 *
 * Offering a control where it can only fail is the mistake this app already
 * made once, with "Parents only" — shown to every member, and working for
 * exactly one of them. So the gating is what is pinned here, rather than the
 * happy path: the throwaway household has a single login, so a successful
 * conversion cannot be exercised from the suite at all, and pretending
 * otherwise would be worse than saying so.
 *
 * The page also had no coverage of any kind until now, which is how it came
 * to be edited three times in one day on nothing but a careful read.
 */

/** A managed child: no login, so neither control applies to them.
 *
 * Reads the row's href and navigates to it, rather than clicking. The first
 * version clicked, and the click did not navigate -- so all three tests below
 * passed while asserting the absence of controls on the family list, which
 * never had them. They stayed green with the gating deliberately removed,
 * which is how that was caught. Taking the address and going there cannot
 * silently not happen.
 */
async function openAManagedChild(page: import("@playwright/test").Page) {
  await page.goto("/family?seg=profile", { waitUntil: "networkidle" });
  const row = page.locator('a[href^="/family/members/"]').filter({ hasText: /Alex|Robin/ }).first();
  await expect(row, "the throwaway household should have a managed child to look at").toBeVisible();
  const href = await row.getAttribute("href");
  expect(href, "the member row should link to a profile").toBeTruthy();

  await page.goto(href!, { waitUntil: "networkidle" });
  // Prove we are on a profile page before asserting what is missing from it.
  await expect(page.getByText(/^HUB 01 · MEMBER RECORD$/i)).toBeVisible();
  await expect(page.getByText("Relationship", { exact: true })).toBeVisible();
}

test("a member's profile page renders without throwing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await openAManagedChild(page);
  await expect(page.locator("body")).toContainText(/Relationship|Health|Profile/i);
  expect(errors, `the page threw: ${errors.join(" | ")}`).toEqual([]);
});

test("a managed child is not offered a role to change", async ({ page }) => {
  await openAManagedChild(page);
  // The heading only exists when the editor does.
  await expect(page.getByText("Role", { exact: true })).toHaveCount(0);
});

test("a managed child is not offered to be converted into one", async ({ page }) => {
  await openAManagedChild(page);
  await expect(page.getByRole("button", { name: /managed child profile/i })).toHaveCount(0);
});

test("the family list carries no role button any more", async ({ page }) => {
  // It was moved here from there on 9 September: a once-per-person decision
  // does not belong on the screen everybody reads every day.
  await page.goto("/family?seg=profile", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /MAKE PARENT|MAKE ADULT/i })).toHaveCount(0);
});
