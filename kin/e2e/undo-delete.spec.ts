import { test, expect, type Page } from "@playwright/test";

/** The answer to the next server action the page sends (a POST carrying
 * Next's Next-Action header). */
const serverAction = (page: Page) => page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);

/** Delete with Undo, in the real app, on the sample member's own Notes
 * (lib/undo-delete.ts). Writes one note, named with a run id, and deletes it
 * by the end -- a weekly-tier spec (CLAUDE.md: write-heavy specs run weekly). */
test("a deleted note can be taken back, and is gone once the toast goes", async ({ page }) => {
  test.setTimeout(90_000);
  const body = `E2E-UNDO-${Date.now().toString(36)} buy stamps`;
  await page.goto("/notes");
  await page.getByLabel("New note").fill(body);
  await page.getByRole("button", { name: "Save note" }).click();
  const note = page.locator("li").filter({ hasText: body });
  await expect(note).toBeVisible();

  try {
    // Delete, then Undo: it comes straight back.
    await note.getByRole("button", { name: "Delete" }).click();
    await expect(note).toHaveCount(0);
    const toastBox = page.locator('.toast[data-kind="undo"]');
    await expect(toastBox).toContainText("Deleted");
    await toastBox.getByRole("button", { name: "Undo" }).click();
    await expect(note).toBeVisible();

    // Delete, and let the toast go (×): it is deleted for real -- by a
    // server action that starts on the ×. Wait for its answer before the
    // reload: "networkidle" on a page already loaded returns at once, and a
    // reload that lands first aborts the delete (weekly run 40253283067).
    await note.getByRole("button", { name: "Delete" }).click();
    const deleted = serverAction(page);
    await page.locator('.toast[data-kind="undo"]').last().getByRole("button", { name: "Close" }).click();
    await deleted;
    await page.reload();
    await expect(page.locator("li").filter({ hasText: body })).toHaveCount(0);
  } finally {
    // If anything above failed with the note still there, take it out.
    await page.goto("/notes");
    const left = page.locator("li").filter({ hasText: body });
    if (await left.count()) {
      await left.getByRole("button", { name: "Delete" }).click();
      const deleted = serverAction(page);
      await page.locator('.toast[data-kind="undo"]').last().getByRole("button", { name: "Close" }).click();
      await deleted.catch(() => {});
    }
  }
});
