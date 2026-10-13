import { test, expect, type Page } from "@playwright/test";

/** The signed-out home page: the family check-up (first open, agreed 13
 * October). Signed out, at a phone's width, the way an ad's visitor arrives. */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

/** Every button and link a thumb can reach on screen is at least 44px tall:
 * the check-up has to work inside Facebook's in-app browser. */
async function expectTapTargets(page: Page) {
  const small = await page.locator("main button:visible, main a.btn:visible, header a:visible").evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim() || el.outerHTML.slice(0, 60)),
  );
  expect(small).toEqual([]);
}

test("the first screen offers the check-up, an invite code and Sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Take the 1-minute family check-up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.locator(".kin-house")).toHaveCount(1);
  await expectTapTargets(page);

  await page.getByRole("button", { name: "I have an invite code" }).click();
  await expect(page.getByLabel("Your invite code")).toBeFocused();
  await page.getByLabel("Your invite code").fill("abc123");
  await page.getByRole("button", { name: "Join" }).click();
  // /join/ keeps the code for the join step and sends a new visitor to sign up.
  await expect(page).toHaveURL(/\/signup/);
  expect((await page.context().cookies()).find((c) => c.name === "kin-invite")?.value).toBe("ABC123");
});

test("/?start=quiz opens at question 1, without the house", async ({ page }) => {
  await page.goto("/?start=quiz");
  await expect(page.getByRole("heading", { name: "Who’s at home?" })).toBeVisible();
  await expect(page.getByText("Question 1 of 8")).toBeVisible();
  await expect(page.locator(".kin-house")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectTapTargets(page);
});

test("the check-up: one question per screen, kids only with kids, and the answers saved in this browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Take the 1-minute family check-up" }).click();

  // 1: many. With kids at home there are nine questions.
  await expect(page.getByRole("heading", { name: "Who’s at home?" })).toBeFocused();
  await page.getByRole("button", { name: "Partner" }).click();
  await page.getByRole("button", { name: "Kids under 13" }).click();
  await expect(page.getByText("Question 1 of 9")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // 2: one answer moves straight on.
  await expect(page.getByRole("heading", { name: /How many apps/ })).toBeFocused();
  await page.getByRole("button", { name: "4 or more" }).click();

  // 3: the order tapped is the rank, and a fourth can't be picked.
  await expect(page.getByRole("heading", { name: "Your top 3, in order" })).toBeFocused();
  for (const p of ["Kids’ safety & location", "Health & medicines", "Documents"]) await page.getByRole("button", { name: p }).click();
  await expect(page.getByRole("button", { name: "Money & bills" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Kids’ safety & location/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "I couldn’t" }).click();
  await page.getByRole("button", { name: "All over the place" }).click();
  // 6: asked, because there are kids.
  await expect(page.getByRole("heading", { name: /When the kids are out/ })).toBeFocused();
  // Back keeps what was answered.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "All over the place" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All over the place" }).click();
  await page.getByRole("button", { name: "Honestly, I worry" }).click();

  // 7 and 8 can be skipped: there's no wrong answer.
  await expect(page.getByRole("heading", { name: /back-and-forth/ })).toBeFocused();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Photo albums" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Curious but privacy first" }).click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("kin-first-open") ?? "null"));
  expect(saved.version).toBe(1);
  expect(saved.top3).toEqual(["kids", "health", "documents"]);
  expect(saved.answers.home).toEqual(["partner", "kids"]);
  expect(saved.answers.ai).toEqual(["privacy"]);
  expect(saved.score).toBeGreaterThanOrEqual(0);
  expect(saved.score).toBeLessThan(40);
  expect(Object.keys(saved.areas).sort()).toEqual(["close", "documents", "health", "home", "kids"]);
});

test("no kids at home: question 6 is skipped", async ({ page }) => {
  await page.goto("/?start=quiz");
  await page.getByRole("button", { name: "Just me for now" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Under a minute" }).click();
  await page.getByRole("button", { name: "In the cloud" }).click();
  await expect(page.getByRole("heading", { name: /back-and-forth/ })).toBeVisible();
  await expect(page.getByText("Question 6 of 8")).toBeVisible();
});
