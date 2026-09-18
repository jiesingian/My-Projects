import type { Page } from "@playwright/test";

/** Opens every collapsed section on the page. Wealth's groups (and a few
 * elsewhere) default to closed since 18 September, so a spec asserting on
 * content that happens to live inside one needs this first -- otherwise
 * the content genuinely isn't in the DOM yet, not just hidden by CSS.
 * Loops rather than a single pass because opening one can change what
 * else matches. */
export async function expandAllCollapsedGroups(page: Page) {
  const collapsed = page.getByRole("button", { expanded: false });
  while ((await collapsed.count()) > 0) {
    await collapsed.first().click();
  }
}
