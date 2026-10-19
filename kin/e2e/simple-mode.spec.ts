import { test, expect, request as playwrightRequest } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Simple Kin on the real Today, at the narrowest phone Kin supports.
 *
 * Turns the sample household's own member to Simple Kin through the API (as
 * themself, under their own row-level security), looks at Today at 320px and
 * 390px, and puts the switch and the text size back afterwards. Before the
 * migration (20261019235700) has reached the database it runs against, the
 * column is not there and this skips. */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let token: string;
let memberId: string;
let original: { simple_mode: boolean; text_scale: number } | null = null;

async function patchMe(patch: Record<string, unknown>) {
  const api = await playwrightRequest.newContext();
  const res = await api.patch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: patch,
  });
  await api.dispose();
  return res.ok();
}

test.describe("Simple Kin's Today", () => {
  test.beforeAll(async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Supabase values are not set; skipping.");
    const api = await playwrightRequest.newContext();
    const auth = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the sample account in").toBeTruthy();
    const session = await auth.json();
    token = session.access_token;
    const res = await api.get(`${SUPABASE_URL}/rest/v1/members?auth_user_id=eq.${session.user.id}&select=id,simple_mode,text_scale`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    await api.dispose();
    test.skip(!res.ok(), "simple_mode is not on this database yet (migration 20261019235700); skipping.");
    const [row] = (await res.json()) as { id: string; simple_mode: boolean; text_scale: number }[];
    memberId = row.id;
    original = { simple_mode: row.simple_mode, text_scale: row.text_scale };
    expect(await patchMe({ simple_mode: true, text_scale: 130 })).toBeTruthy();
  });

  // Whatever this did to the sample member, it is put back.
  test.afterAll(async () => {
    if (original) await patchMe(original);
  });

  for (const width of [320, 390]) {
    test(`leads with medicines, plans, family and SOS, and fits ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/today");
      for (const heading of ["My medicines today", "Today’s plans", "Family"]) {
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      }
      await expect(page.getByRole("link", { name: "Message the family" })).toBeVisible();
      await expect(page.getByRole("button", { name: /SOS/i })).toBeVisible();
      // Nothing wider than the phone.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Every button and link a finger reaches is at least 44px tall.
      const small = await page.locator(".kin-simple-today :is(button, a.btn)").evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent?.trim()),
      );
      expect(small).toEqual([]);
      const { violations } = await new AxeBuilder({ page }).include(".kin-simple-today").withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(violations.map((v) => v.id)).toEqual([]);
    });
  }
});
