import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";

const STATE = "e2e/.auth/state.json";

/** Signs in once, and every other spec reuses the cookie.
 *
 * The credentials belong to a throwaway household that exists only to be
 * tested against -- never a real family's account. They come from the
 * environment because a password in the repository is a password that has
 * leaked, and because whoever runs this suite next may point it at a
 * different throwaway. See e2e/README.md. */
setup("sign in", async ({ page }) => {
  // Room for three tries and the pauses between them (below).
  setup.setTimeout(180_000);
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD are not set. These tests drive a real signed-in " +
        "session against a throwaway household; see kin/e2e/README.md for how to " +
        "make one. Refusing to run rather than testing a logged-out shell.",
    );
  }

  // Up to three tries, a growing pause between them. Dev's auth server is
  // small; when many pull requests test at once it can run out of database
  // connections and time out for a few minutes (7 October), which failed every
  // run that signed in during them. A wrong password fails all three tries,
  // as it should.
  for (let attempt = 1; ; attempt++) {
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    try {
      // Landing anywhere that is not /login means the session took.
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(15_000 * attempt);
    }
  }
  await page.goto("/today");
  // "At a glance" is on Today whatever the day holds. The old marker, "Needs
  // you today", went when Today became one list (28 September) -- and was
  // never there on a quiet day anyway.
  await expect(page.locator("body")).toContainText(/at a glance/i, { timeout: 30_000 });

  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: STATE });
});
