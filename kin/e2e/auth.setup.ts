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
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD are not set. These tests drive a real signed-in " +
        "session against a throwaway household; see kin/e2e/README.md for how to " +
        "make one. Refusing to run rather than testing a logged-out shell.",
    );
  }

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Landing anywhere that is not /login means the session took.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await page.goto("/today");
  await expect(page.locator("body")).toContainText(/needs you today/i, { timeout: 30_000 });

  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: STATE });
});
