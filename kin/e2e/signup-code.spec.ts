import { test, expect } from "@playwright/test";

/** Sign-up confirms with a 6-digit code typed on the screen the person is
 * already on (agreed 13 October), because Kin will be opened from Facebook and
 * the emailed link opens outside Facebook's browser, leaving the sign-up
 * behind.
 *
 * A real sign-up needs the email's code, which this suite cannot read, so
 * these check the screens and the refusals. The one call that reaches Supabase
 * verifies a made-up code for an address that has no account: nothing is
 * created or written. Signed out, as a visitor is. */
test.use({ storageState: { cookies: [], origins: [] } });

const NOBODY = "kin-e2e-no-such-account@example.com";

test("sign-up asks for an email and password, with no Google button", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  // Google refuses its sign-in inside Facebook's browser.
  await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /sign (in|up) with google/i })).toHaveCount(0);
});

test("agreeing to the terms is a box the person ticks: unticked, and required", async ({ page }) => {
  await page.goto("/signup");
  const box = page.getByRole("checkbox", { name: /I agree to the terms/ });
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAttribute("required", "");
});

test("the code screen takes the code and refuses one of the wrong shape without asking Supabase", async ({ page }) => {
  await page.goto(`/verify?email=${encodeURIComponent(NOBODY)}`);
  await expect(page.getByText(NOBODY)).toBeVisible();
  const code = page.getByLabel("Code from the email");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");

  await code.fill("123");
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.locator(".kin-form-error")).toContainText("Enter the 6-digit code from the email.");
  await expect(page).toHaveURL(/\/verify/);
});

test("a wrong code is refused and the person stays on the screen", async ({ page }) => {
  await page.goto(`/verify?email=${encodeURIComponent(NOBODY)}`);
  await page.getByLabel("Code from the email").fill("000 000");
  await page.getByRole("button", { name: /^confirm$/i }).click();
  await expect(page.locator(".kin-form-error")).toContainText(/isn't right, or it has expired|Too many attempts/);
  await expect(page).toHaveURL(/\/verify/);
});

test("the emailed link still lands somewhere sensible while the template has no code", async ({ page }) => {
  // The callback the link uses, with a code that is not one: back to sign-in
  // with the explanation, not an error page. Reaching it at all is the point
  // -- the link must keep working until the template is switched.
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/login\?error=confirmation_failed/);
});
