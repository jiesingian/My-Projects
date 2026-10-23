import { test, expect } from "@playwright/test";
import { HELP_GUIDE, HELP_TAG_LABELS, HELP_TABS_HIDDEN_IN_KID_VIEW, HELP_GROUPS_HIDDEN_IN_KID_VIEW } from "@/lib/help-guide";

/** Settings -> Help (lib/help-guide.ts): every entry complete, nothing said
 * twice, and the kid-view filters naming tabs and groups that exist. */

const features = HELP_GUIDE.flatMap((t) => t.groups.flatMap((g) => g.features));

test("every feature says what it is, how to use it, and at least one pro", () => {
  for (const f of features) {
    expect(f.name.trim(), "name").not.toBe("");
    expect(f.what.trim().length, `${f.name}: what`).toBeGreaterThan(10);
    expect(f.how.trim().length, `${f.name}: how`).toBeGreaterThan(5);
    expect(f.pros.length, `${f.name}: pros`).toBeGreaterThan(0);
    expect(f.cons.length + f.tips.length, `${f.name}: a con or a tip`).toBeGreaterThan(0);
  }
});

test("no feature appears twice, and every tag has a label", () => {
  const names = features.map((f) => f.name);
  expect(new Set(names).size).toBe(names.length);
  for (const f of features) for (const tag of f.tags) expect(HELP_TAG_LABELS[tag], `${f.name}: ${tag}`).toBeTruthy();
});

test("the kid-view filters name tabs and groups that exist", () => {
  const tabIds = HELP_GUIDE.map((t) => t.id);
  for (const id of HELP_TABS_HIDDEN_IN_KID_VIEW) expect(tabIds).toContain(id);
  const groups = HELP_GUIDE.flatMap((t) => t.groups.map((g) => g.title));
  for (const g of HELP_GROUPS_HIDDEN_IN_KID_VIEW) expect(groups).toContain(g);
});
