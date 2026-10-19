import { test, expect } from "@playwright/test";
import { PALETTES, REMOVED_PALETTES, contrast, paletteById, paletteCss } from "@/lib/palettes";

/** Every colour theme in Settings has to stay readable.
 *
 * A palette is picked for how it looks and then used for months, so the one
 * that looks lovely and has captions nobody can read is the one that does the
 * damage. These are WCAG AA's numbers: 4.5:1 for text. Kin Classic's button
 * used to be the exception (white on iOS system blue is 4.02:1, 3.65:1 in
 * dark); since the accessibility pass its blue is #0068d9 (5.3:1), so every
 * palette, Classic included, meets 4.5:1. */

/** `pct` of one colour over another, as color-mix(in srgb) paints it. */
function mix(a: string, pct: number, b: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round((v * pct) / 100 + (y[i] * (100 - pct)) / 100).toString(16).padStart(2, "0")).join("");
}
/** The text colour at 6% over a ground, as .btn-secondary paints it. */
const wash = (text: string, ground: string) => mix(text, 6, ground);
/** globals.css's --cal-money, light and dark. */
const MONEY = { light: "#e8590c", dark: "#ff922b" };

for (const p of PALETTES) {
  for (const mode of ["light", "dark"] as const) {
    const m = p[mode];
    test(`${p.name} (${mode}) is readable`, () => {
      expect(contrast(m.text, m.bg), "text on page").toBeGreaterThanOrEqual(7);
      expect(contrast(m.text, m.surface), "text on card").toBeGreaterThanOrEqual(7);
      expect(contrast(m.muted, m.bg), "caption on page").toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.muted, m.surface), "caption on card").toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.ink, m.surface), "link on card").toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", m.accent), "white on button").toBeGreaterThanOrEqual(4.5);
      // The focus ring is accent-700 (ink), not the accent: on ten dark
      // themes the accent was under 3:1 against the page (WCAG 1.4.11).
      expect(contrast(m.ink, m.bg), "focus ring and link on page").toBeGreaterThanOrEqual(4.5);
      // A secondary button's label is ink on a 6% wash of the text colour,
      // over the page or a card. Solarized's sat at 4.46:1 (19 October).
      for (const ground of [m.bg, m.surface]) {
        expect(contrast(m.ink, wash(m.text, ground)), `secondary button label on ${ground}`).toBeGreaterThanOrEqual(4.5);
        // An overdue line's orange: --cal-money 55% into the text colour.
        // At 70% it was 4.2:1 on Catppuccin's page and 4.35:1 on Premium Card.
        const urgent = mix(MONEY[p.darkOnly ? "dark" : mode], 55, m.text);
        expect(contrast(urgent, ground), `overdue line on ${ground}`).toBeGreaterThanOrEqual(4.5);
        // The SOS button's word and a late dose: red 45% into the text colour.
        expect(contrast(mix("#e5484d", 45, m.text), ground), `SOS on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
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

test("a removed theme reads as its nearest kept theme, never as nothing", () => {
  for (const [gone, kept] of Object.entries(REMOVED_PALETTES)) {
    expect(PALETTES.some((p) => p.id === gone), `${gone} is out of the picker`).toBe(false);
    expect(paletteById(gone).id, gone).toBe(kept);
    expect(paletteCss(gone)).toBe(paletteCss(kept));
  }
});

test("a flat palette drops shadows, glass and the wash, and only it does", () => {
  const css = paletteCss("clay");
  expect(css).toContain("--shadow-sm:none");
  expect(css).toContain("--glass-blur:none");
  expect(css).toContain("html:root body{background:var(--color-bg)}");
  // The flat tokens have to be in the dark blocks too, or globals.css's dark
  // shadows (a heavier selector than html:root) would come back at night.
  expect(css.split("--shadow-sm:none").length - 1).toBe(3);
  expect(paletteCss("auralis")).not.toContain("--shadow-sm:none");
});
