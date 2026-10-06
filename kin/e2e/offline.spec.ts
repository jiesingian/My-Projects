import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/** Offline Kin, end to end, against the throwaway household only.
 *
 * Online first, so the service worker installs the shell and the app saves
 * its snapshot; then the connection is cut (Playwright's own offline mode,
 * which the worker's fetches obey too), the saved screens are read, the four
 * queueable changes are made, and the connection comes back. What is checked
 * at the end is what the household would notice: every change arrived, and
 * arrived once.
 *
 * Writes: one shopping item and one household chat message, both named with
 * a run id so a rerun never mistakes an old one for its own. */

const SHOTS = process.env.OFFLINE_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Waits until the worker controls the page, the shell is cached and the
 * snapshot is saved: the three things offline Kin needs. */
async function waitForOfflineReady(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!navigator.serviceWorker?.controller) return "no worker";
          const shell = await caches.match("/offline");
          if (!shell) return "no shell";
          const saved = await new Promise<boolean>((resolve) => {
            const req = indexedDB.open("kin-offline");
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains("snapshot")) return resolve(false);
              const get = db.transaction("snapshot").objectStore("snapshot").get("current");
              get.onsuccess = () => resolve(!!get.result);
              get.onerror = () => resolve(false);
            };
            req.onerror = () => resolve(false);
          });
          return saved ? "ready" : "no snapshot";
        }),
      { timeout: 45_000, intervals: [500, 1000, 2000] },
    )
    .toBe("ready");
}

test.describe("offline Kin", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens with no signal, queues changes, and syncs them once", async ({ page, context }) => {
    test.setTimeout(180_000);
    const run = Date.now().toString(36);
    const item = `Offline test ${run}`;
    const message = `Sent offline ${run}`;

    await page.goto("/today");
    // The first load registers the worker; the second is the one it controls.
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForOfflineReady(page);

    // A live page, as the connection drops: it says so, calmly.
    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "changes on this screen won’t save" })).toBeVisible();
    await shot(page, "1-live-page-offline-banner");

    // Opening Kin with no signal lands on the saved copy of that screen.
    await page.goto("/household?seg=buy");
    await expect(page).toHaveURL(/\/offline\?from=/);
    await expect(page.getByText(/Offline — showing what was saved at \d{1,2}:\d{2} [ap]m/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /To buy/ })).toBeVisible();

    // Add an item, and tick the first one on the list if there is one.
    await page.getByLabel("Add an item").fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(item)).toBeVisible();
    await expect(page.getByText("waiting to sync").first()).toBeVisible();
    await shot(page, "2-list-offline");

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await shot(page, "3-today-offline");

    await page.getByRole("button", { name: "Planner", exact: true }).click();
    await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
    await shot(page, "4-planner-offline");

    await page.getByRole("button", { name: "SOS", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Emergency cards" })).toBeVisible();
    await shot(page, "5-emergency-offline");

    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await page.getByLabel("Message").fill(message);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Sending when you're back online")).toBeVisible();
    await expect(page.getByText(/2 changes waiting to sync/)).toBeVisible();
    await shot(page, "6-chat-offline");

    // A reload offline still opens, with the queue intact.
    await page.reload();
    await expect(page.getByText(/2 changes waiting to sync/)).toBeVisible();

    // Signal again: both go, and the shell says so.
    await context.setOffline(false);
    await expect(page.getByText(/Back online · 2 changes saved/)).toBeVisible({ timeout: 30_000 });
    await shot(page, "7-back-online");

    // Once each, in the real app.
    await page.goto("/household?seg=buy");
    // Filed under Other by its name, and sections start folded.
    await page.getByRole("button", { name: /^Other/ }).click();
    await expect(page.getByText(item, { exact: true })).toHaveCount(1);
    await page.goto("/chat/household");
    await expect(page.getByText(message, { exact: true })).toHaveCount(1);
  });

  test("the shell shows nothing once signed out", async ({ browser }) => {
    // A fresh, signed-out context: the sign-in screen clears the phone, and
    // with nothing saved the shell says so rather than showing anybody's data.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/offline");
    await expect(page.getByText(/Nothing is saved on this phone yet|Back online/)).toBeVisible();
    await context.close();
  });
});
