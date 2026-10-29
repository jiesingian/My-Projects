import { test, expect, type Page } from "@playwright/test";

/** The signed-out home page: the family check-up (first open, agreed 13
 * October). Signed out, at a phone's width, the way an ad's visitor arrives. */
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } });

/** Every button and link a thumb can reach on screen is at least 44px tall:
 * the check-up has to work inside Facebook's in-app browser. A hundredth of
 * a pixel spare: a 2.75rem button sometimes lays out at 43.99994px (weekly
 * check, 29 October, "Share your result"), which is 44 to any thumb. */
async function expectTapTargets(page: Page) {
  const small = await page.locator("main button:visible, main a.btn:visible, header a:visible").evaluateAll((els) =>
    els.filter((el) => el.getBoundingClientRect().height < 43.99).map((el) => `${el.textContent?.trim() || el.outerHTML.slice(0, 60)} (${el.getBoundingClientRect().height}px)`),
  );
  expect(small).toEqual([]);
}

test("the first screen offers the check-up, an invite code and Sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Find out your Family’s Digital Blueprint!" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Who makes up your household?" })).toBeVisible();
  // No total yet: it depends on the answer (kids at home or not).
  await expect(page.getByText("Question 1", { exact: true })).toBeVisible();
  await expect(page.locator(".kin-house")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectTapTargets(page);
});

test("the check-up: one question per screen, kids only with kids, and the answers saved in this browser", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find out your Family’s Digital Blueprint!" }).click();

  // 1: many. The count has no total until it's answered, so it never
  // changes under the visitor's thumb. Each answer shows what Kin does
  // about it, and nothing moves on until Next.
  await expect(page.getByRole("heading", { name: "Who makes up your household?" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "My Spouse or Partner" }).click();
  await page.getByRole("button", { name: "My Kids under 18" }).click();
  await expect(page.getByText("Question 1", { exact: true })).toBeVisible();
  await expect(page.locator(".kin-check-tip")).toContainText("Kids get their own kid view");
  await page.getByRole("button", { name: "Next" }).click();

  // 2: what the family keeps track in, paper included. With kids at home
  // there are nine questions.
  await expect(page.getByRole("heading", { name: /How does your family keep track/ })).toBeFocused();
  await expect(page.getByText("Question 2 of 9")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  for (const t of [/A group chat/, "Notes or reminder apps", "Spreadsheets", /^Paper/]) await page.getByRole("button", { name: t }).click();
  await expect(page.locator(".kin-check-tip")).toContainText("Keep the wall calendar");
  await page.getByRole("button", { name: "Next" }).click();

  // 3: the order tapped is the rank, and a fourth can't be picked.
  await expect(page.getByRole("heading", { name: "What are your family’s top 3 priorities?" })).toBeFocused();
  for (const p of ["Travel and family adventures", "Family health and wellness", "Important documents and records"]) await page.getByRole("button", { name: p }).click();
  await expect(page.getByRole("button", { name: "Financial planning and budgeting" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Travel and family adventures" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();

  // A single answer waits for Next too, so its tip can be read.
  await page.getByRole("button", { name: "We’re not sure where everything is" }).click();
  await expect(page.locator(".kin-check-tip")).toContainText("emergency card");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "In different places" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // 6: asked, because there are kids.
  await expect(page.getByRole("heading", { name: /When the kids are out/ })).toBeFocused();
  // Back keeps what was answered.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "In different places" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Honestly, I worry" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // 7: nothing can be skipped; there's an answer for a home that runs smoothly.
  await expect(page.getByRole("heading", { name: "The Daily Check-In" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  await page.getByRole("button", { name: "Groceries & meals" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Photo albums" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("button", { name: "I already use AI tools regularly" })).toBeVisible();
  await page.getByRole("button", { name: "Curious but privacy first" }).click();
  await page.getByRole("button", { name: "See my results" }).click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("kin-first-open") ?? "null"));
  expect(saved.version).toBe(1);
  expect(saved.top3).toEqual(["travel", "health", "documents"]);
  expect(saved.answers.home).toEqual(["partner", "kids"]);
  expect(saved.answers.ai).toEqual(["privacy"]);
  expect(saved.score).toBeGreaterThanOrEqual(0);
  expect(saved.score).toBeLessThan(40);
  expect(Object.keys(saved.areas).sort()).toEqual(["close", "documents", "health", "home", "kids"]);

  // The result: Your Family’s Digital Blueprint. The score is questions 2,
  // 4 and 5 only: four places (25), "not sure where everything is" (0) and
  // papers in different places (0) make 8. Two of the top 3 are health and
  // documents, so The Prepared Family's features and button; the profile
  // itself isn't shown (Janine, 19 October). The privacy line
  // because question 9 was "privacy first".
  await expect(page.getByRole("heading", { name: "Your Family’s Digital Blueprint" })).toBeFocused();
  expect(saved.score).toBe(8);
  await expect(page.getByText(`${saved.score}/100`)).toBeVisible();
  await expect(page.getByRole("meter", { name: "Family Digital Readiness Score" })).toHaveAttribute("aria-valuenow", "8");
  await expect(page.getByRole("heading", { name: "The Fresh Start" })).toBeVisible();
  await expect(page.getByText(/informal self-check/)).toBeVisible();
  await expect(page.getByText(/family profile/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The Prepared Family" })).toHaveCount(0);
  const hub = page.locator(".kin-check-hub li");
  expect(await hub.count()).toBeGreaterThanOrEqual(3);
  expect(await hub.count()).toBeLessThanOrEqual(5);
  await expect(hub.first()).toContainText("Health profiles");
  // No "N places to keep track" line any more (Janine, 15 October).
  await expect(page.getByText(/places to keep track/)).toHaveCount(0);
  await expect(page.getByText("Private to your family. Nothing is sold, and your records never train AI.")).toBeVisible();
  await expectTapTargets(page);

  // Share your result (19 October): a picture of the score, the profile only
  // if ticked, to the share sheet -- a download where there is none, as here.
  await page.getByRole("button", { name: "Share your result" }).click();
  await expect(page.getByRole("img", { name: "Preview of the picture to share" })).toBeVisible();
  await expect(page.getByLabel("Our score")).toBeChecked();
  await page.getByLabel("Our family profile").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share the picture" }).click();
  expect((await download).suggestedFilename()).toBe("kin-family-blueprint.png");
  await expect(page.getByText("Saved to your downloads.")).toBeVisible();
  await expectTapTargets(page);

  // The showcase: the top 3 first, then one app, private to your family.
  await page.getByRole("button", { name: "Organize what matters" }).click();
  await expect(page.getByRole("heading", { name: "How Kin helps" })).toBeFocused();
  const slides = page.locator(".kin-check-slide h3");
  await expect(slides).toHaveCount(4);
  expect(await slides.allTextContents()).toEqual(["Trips, planned together", "Everyone’s health, one tap away", "Papers you can findPLUS", "One app, private to your family"]);
  // Only the sample household, never anyone real.
  for (const phone of await page.locator(".kin-check-phone").all()) await expect(phone).toHaveAttribute("aria-label", /sample household$/);
  await expectTapTargets(page);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Choose your plan" }).click();

  // The plan: Plus highlighted and picked, prices from plans.ts, and the
  // no-surprise-charges promise.
  await expect(page.getByRole("heading", { name: "Pick how you start" })).toBeFocused();
  await expect(page.getByRole("radio", { name: /Start with Plus free/ })).toBeChecked();
  await expect(page.getByText(/₱149\/mo or ₱1,490\/yr/)).toBeVisible();
  await expect(page.getByText("No automatic payment, ever, unless you subscribe yourself.")).toBeVisible();
  await expect(page.getByText("Do nothing and you move to Kin Free and keep everything.")).toBeVisible();
  await expectTapTargets(page);

  // The privacy notice and back: the same step, nothing to answer again.
  await page.getByRole("link", { name: "How Kin handles your family’s information" }).click();
  await expect(page).toHaveURL(/\/legal\/privacy/);
  await page.getByRole("button", { name: "← Back" }).click();
  await expect(page.getByRole("heading", { name: "Pick how you start" })).toBeVisible();

  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/signup/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kin-first-open") ?? "null")?.plan)).toBe("plus");
});

test("no kids at home: question 6 is skipped", async ({ page }) => {
  await page.goto("/?start=quiz");
  await page.getByRole("button", { name: "Just me" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "We remember and remind each other" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Schedules, appointments and events" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /^In seconds/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Originals kept in a safe are an answer of their own.
  await page.getByRole("button", { name: "In a safe or locked cabinet" }).click();
  await expect(page.locator(".kin-check-tip")).toContainText("Keep the originals where they are");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "The Daily Check-In" })).toBeVisible();
  await expect(page.getByText("Question 6 of 8")).toBeVisible();
  await page.getByRole("button", { name: "Not much, it runs smoothly" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "None of these" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Ready to try" }).click();
  await page.getByRole("button", { name: "See my results" }).click();
  // Remembering (25), in seconds (100), a safe (75): 67, The Connected
  // Path. Plans alone picked: The Organized Family's button. No privacy line.
  await expect(page.getByText("67/100")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Connected Path" })).toBeVisible();
  await expect(page.getByText(/Private to your family/)).toHaveCount(0);

  // The showcase can be skipped, and Kin Free is a real choice.
  await page.getByRole("button", { name: "Explore your family hub" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByText("Just Kin Free").click();
  await page.getByRole("button", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/signup/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("kin-first-open") ?? "null")?.plan)).toBe("free");
});
