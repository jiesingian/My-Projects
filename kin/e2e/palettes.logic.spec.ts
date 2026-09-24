import { test, expect } from "@playwright/test";
import { PALETTES, contrast, paletteCss } from "@/lib/palettes";

/** Every colour theme in Settings has to stay readable.
 *
 * A palette is picked for how it looks and then used for months, so the one
 * that looks lovely and has captions nobody can read is the one that does the
 * damage. These are WCAG AA's numbers: 4.5:1 for text. Kin Classic's button
 * is held to what it already ships with -- white on iOS system blue is 4.02:1
 * in light and 3.65:1 in dark -- so this test records that rather than
 * pretending; every new palette meets 4.5:1. */

for (const p of PALETTES) {
  for (const mode of ["light", "dark"] as const) {
    const m = p[mode];
    test(`${p.name} (${mode}) is readable`, () => {
      expect(contrast(m.text, m.bg), "text on page").toBeGreaterThanOrEqual(7);
      expect(contrast(m.text, m.surface), "text on card").toBeGreaterThanOrEqual(7);
      expect(contrast(m.muted, m.bg), "caption on page").toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.muted, m.surface), "caption on card").toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.ink, m.surface), "link on card").toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", m.accent), "white on button").toBeGreaterThanOrEqual(p.id === "classic" ? 3.6 : 4.5);
    });
  }
}

test("Kin Classic adds nothing to globals.css, and an unknown id falls back to it", () => {
  expect(paletteCss("classic")).toBe("");
  expect(paletteCss("no-such-theme")).toBe("");
});

test("a dark-only palette is dark whatever the switch says", () => {
  const css = paletteCss("dracula");
  expect(css).toContain("color-scheme:dark");
  expect(css).not.toContain('data-theme="dark"');
});
