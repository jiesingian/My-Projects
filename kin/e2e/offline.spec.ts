import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { restAsQa } from "./support/qa-household";

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
    // Today queues its own Done, so it says what waits rather than that
    // nothing saves.
    await expect(page.getByRole("status").filter({ hasText: "wait here and send when you’re back" })).toBeVisible();
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

  test("the live list and chat queue while offline, and sync once", async ({ page, context }) => {
    test.setTimeout(180_000);
    const run = Date.now().toString(36);
    const item = `Live offline ${run}`;
    const message = `Live sent offline ${run}`;

    // Two tabs, both opened online: the list, and the household chat.
    await page.goto("/household?seg=buy");
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForOfflineReady(page);
    const chat = await context.newPage();
    await chat.goto("/chat/household");
    await expect(chat.getByLabel("Your message")).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByRole("status").filter({ hasText: "wait here and send when you’re back" })).toBeVisible();

    // Added on the live list, not the saved copy.
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.getByPlaceholder("Add an item").fill(item);
    await page.getByRole("button", { name: "ADD", exact: true }).click();
    await expect(page.getByText("Waiting to add")).toBeVisible();
    await expect(page.getByText(item)).toBeVisible();
    await expect(page).toHaveURL(/\/household/);
    await shot(page, "8-live-list-offline");

    await chat.getByLabel("Your message").fill(message);
    await chat.keyboard.press("Enter");
    await expect(chat.getByText(message)).toBeVisible();
    await expect(chat.getByText("Sends when you’re back online")).toBeVisible();
    await shot(chat, "9-live-chat-offline");

    // Signal again: one tab sends both, once.
    await context.setOffline(false);
    const said = /Back online · 2 changes saved/;
    await expect.poll(async () => (await page.getByText(said).count()) + (await chat.getByText(said).count()), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(chat.getByText("Sends when you’re back online")).toHaveCount(0, { timeout: 15_000 });

    await page.goto("/household?seg=buy");
    await page.getByRole("button", { name: /^Other/ }).click();
    await expect(page.getByText(item, { exact: true })).toHaveCount(1);
    await chat.goto("/chat/household");
    await expect(chat.getByText(message, { exact: true })).toHaveCount(1);

    // Tidy the throwaway household: this test's two rows only.
    const qa = await restAsQa();
    if (qa) {
      await qa.ctx.delete(`${qa.url}/rest/v1/buy_items?name=eq.${encodeURIComponent(item)}`, { headers: qa.headers });
      // A message cannot be deleted, only unsent, as the app does.
      await qa.ctx.patch(`${qa.url}/rest/v1/family_messages?body=eq.${encodeURIComponent(message)}`, {
        headers: qa.headers,
        data: { deleted_at: new Date().toISOString(), body: "" },
      });
    }
  });

  test("a reply with an @tag written offline keeps both when it sends", async ({ page, context }) => {
    test.setTimeout(180_000);
    const qa = await restAsQa();
    test.skip(!qa, "Needs the QA household's Supabase details to check the stored message.");
    const run = Date.now().toString(36);
    const target = `Reply target ${run}`;
    const reply = `Offline reply ${run}`;

    // Someone to tag: the first other person in the throwaway household.
    const people = (await (await qa!.ctx.get(`${qa!.url}/rest/v1/members?select=id,full_name,status`, { headers: qa!.headers })).json()) as { id: string; full_name: string; status: string }[];
    const tagged = people.find((p) => p.status === "active" || p.status === "managed");
    test.skip(!tagged, "The QA household has nobody to tag.");
    const first = tagged!.full_name.split(" ")[0];

    await page.goto("/chat/household");
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForOfflineReady(page);

    // Said online, so it has a real id to answer.
    await page.getByLabel("Your message").fill(target);
    await page.keyboard.press("Enter");
    // Wait for the server's copy, not the optimistic one: the bubble becomes
    // a button ("Message from you at …") once the thread has refreshed with
    // it. Cut off mid-refresh, Next falls back to a full load, which offline
    // is the saved copy -- the wrong page to test the live composer on.
    const posted = page.getByRole("button", { name: /^Message from you at/ }).filter({ hasText: target });
    await expect(posted).toBeVisible();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await expect(page).toHaveURL(/\/chat\/household/);
    await posted.click();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByText(/Replying to/)).toBeVisible();
    await page.getByLabel("Your message").fill(`@${first.slice(0, 2)}`);
    // The chip reads its initials, then the name ("RT Robin").
    await page.getByRole("button", { name: new RegExp(`\\b${first}$`) }).first().click();
    await page.getByLabel("Your message").pressSequentially(reply);
    await page.keyboard.press("Enter");

    // Waiting, with its quote.
    await expect(page.getByText("Sends when you’re back online")).toBeVisible();
    await expect(page.locator(".kin-quote", { hasText: target }).last()).toBeVisible();
    await shot(page, "10-live-reply-offline");

    await context.setOffline(false);
    await expect(page.getByText("Sends when you’re back online")).toHaveCount(0, { timeout: 30_000 });

    // Stored as written: answering the target, tagging the person.
    const rows = (await (
      await qa!.ctx.get(`${qa!.url}/rest/v1/family_messages?select=id,body,reply_to,mentions&body=in.(${encodeURIComponent(`"${target}"`)},${encodeURIComponent(`"@${first} ${reply}"`)})`, { headers: qa!.headers })
    ).json()) as { id: string; body: string; reply_to: string | null; mentions: string[] }[];
    const original = rows.find((r) => r.body === target);
    const sent = rows.filter((r) => r.body !== target);
    expect(sent).toHaveLength(1);
    expect(sent[0].reply_to).toBe(original?.id);
    expect(sent[0].mentions).toContain(tagged!.id);

    // Tidy: both messages unsent, as the app does.
    for (const r of rows) {
      await qa!.ctx.patch(`${qa!.url}/rest/v1/family_messages?id=eq.${r.id}`, { headers: qa!.headers, data: { deleted_at: new Date().toISOString(), body: "" } });
    }
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
