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
  const collapsed = page.locator('button[aria-expanded="false"]:not([aria-haspopup])').filter({ visible: true });
  // A closed <details> hides what is inside it without taking it out of
  // the DOM: Cash Flow's "N entries" fold under a category (26 October)
  // sits in one, and clicking a hidden disclosure waits forever. Its
  // summary is opened like any fold, and only what can be seen is clicked.
  const summaries = page.locator("details:not([open]) > summary").filter({ visible: true });
  const any = page.locator('button[aria-expanded="false"]:not([aria-haspopup]), details:not([open]) > summary');
  // Nothing can be seen yet though something is there: the page is still
  // hydrating (a group opened by the URL keeps its content hidden until
  // then), or a group just opened is still fading in (.kin-reveal, 0.18s).
  // Waiting for the first disclosure to show covers both; one that never
  // shows ends the loop rather than hanging it.
  // Hydration gets 10s once; a fade-in, a moment. A page whose only
  // remaining disclosure is one nothing opens costs the loop that moment.
  let waited = false;
  const settle = async () => {
    if ((await any.count()) === 0) return false;
    await any.first().waitFor({ state: "visible", timeout: waited ? 1_500 : 10_000 }).catch(() => {});
    waited = true;
    return (await collapsed.count()) > 0 || (await summaries.count()) > 0;
  };
  for (;;) {
    if ((await collapsed.count()) > 0) await collapsed.first().click();
    else if ((await summaries.count()) > 0) await summaries.first().click();
    else if (!(await settle())) break;
  }
}
