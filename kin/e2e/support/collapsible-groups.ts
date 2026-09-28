import type { Page } from "@playwright/test";

/** Opens every collapsed section on the page. Wealth's groups (and a few
 * elsewhere) default to closed since 18 September, so a spec asserting on
 * content that happens to live inside one needs this first -- otherwise
 * the content genuinely isn't in the DOM yet, not just hidden by CSS.
 * Loops rather than a single pass because opening one can change what
 * else matches.
 *
 * Only disclosure buttons, never a menu button (aria-haspopup). Wealth's Who
 * picker is one, and opening it lays a backdrop over the page that swallows
 * every click after it -- which is how goal-contribute, deletes, who-picker
 * and link-app-field all timed out on the same page at once. */
export async function expandAllCollapsedGroups(page: Page) {
  const collapsed = page.locator('button[aria-expanded="false"]:not([aria-haspopup])');
  while ((await collapsed.count()) > 0) {
    await collapsed.first().click();
  }
}
