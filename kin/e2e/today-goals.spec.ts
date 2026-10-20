import { test, expect } from "@playwright/test";

/** Today's Goals, collapsible (Janine, 20 October), as the sample
 * household. Read-only: it opens and closes the section (which only writes
 * this browser's cookie) and never taps "+". Skips, saying so, when the
 * household has no goals for today -- then there is no section to test. */

test("the header is a button that opens and closes the list, by mouse and keyboard, and is remembered", async ({ page }) => {
  await page.goto("/today");
  const header = page.getByRole("button", { name: /Today’s Goals/ });
  test.skip((await header.count()) === 0, "The sample household has no goals for today, so there is no section.");

  await expect(header).toHaveAttribute("aria-expanded", /true|false/);
  const region = page.locator(`#${await header.getAttribute("aria-controls")}`);
  const start = (await header.getAttribute("aria-expanded")) === "true";

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", String(!start));
  await expect(region).toHaveAttribute("data-open", String(!start));

  // The keyboard: focus it, then Enter, then Space.
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", String(start));
  await page.keyboard.press(" ");
  await expect(header).toHaveAttribute("aria-expanded", String(!start));

  // Remembered on this device, unless everything is done (then it always
  // starts closed).
  await page.reload();
  const again = page.getByRole("button", { name: /Today’s Goals/ });
  const allDone = /All done/.test((await again.textContent()) ?? "");
  await expect(again).toHaveAttribute("aria-expanded", allDone ? "false" : String(!start));

  // Leave it as it was found.
  if ((await again.getAttribute("aria-expanded")) !== String(start) && !allDone) await again.click();
});

test("a closed section hides its rows from the keyboard", async ({ page }) => {
  await page.goto("/today");
  const header = page.getByRole("button", { name: /Today’s Goals/ });
  test.skip((await header.count()) === 0, "The sample household has no goals for today, so there is no section.");
  const wasOpen = (await header.getAttribute("aria-expanded")) === "true";
  if (wasOpen) await header.click();
  const region = page.locator(`#${await header.getAttribute("aria-controls")}`);
  await expect(region).toHaveAttribute("inert", "");
  if (wasOpen) await header.click();
});
