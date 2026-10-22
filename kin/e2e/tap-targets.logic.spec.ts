import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PALETTES, contrast, paletteCss } from "@/lib/palettes";

/** Two accessibility rules that live in globals.css, checked against the real
 * compiled stylesheet in a blank page -- no server, no sign-in, no household
 * (accessibility pass, 19 October).
 *
 * 1. Tap targets. On a touch screen every .btn and every chip that is a
 *    button, link or label answers a finger
 *    44px across even when it is drawn smaller (a 32px "Done" on a row).
 *    With a mouse nothing changes.
 * 2. Focus. The keyboard's ring is drawn, and in every theme, light and
 *    dark, it reads at 3:1 against the page (WCAG 1.4.11). It used to be the
 *    accent, under 3:1 on ten dark themes.
 *
 * Skips without a build (`npm run build` first); CI builds before this runs. */

const CHUNKS = path.join(process.cwd(), ".next/static/chunks");
const css = fs.existsSync(CHUNKS)
  ? fs
      .readdirSync(CHUNKS)
      .filter((f) => f.endsWith(".css"))
      .map((f) => fs.readFileSync(path.join(CHUNKS, f), "utf8"))
      .find((c) => c.includes(".kin-tab"))
  : undefined;

async function render(page: Page, extraCss = "", theme = "light") {
  await page.setContent(
    `<!doctype html><html lang="en" data-theme="${theme}"><head><title>t</title><style>${css}</style><style>${extraCss}</style></head>` +
      `<body><main style="padding:60px"><button class="btn btn-primary" id="small" style="min-height:2rem;font-size:0.8125rem;padding:0 0.875rem">Done</button>` +
      `<button class="chip" id="chip" style="margin-left:80px">Chip</button><span class="chip" id="tag" style="margin-left:80px">Tag</span></main></body></html>`,
  );
}

/** Whether a tap this far below the button's centre lands on it. */
async function hitsBelow(page: Page, id: string, dy: number): Promise<boolean> {
  return page.evaluate(
    ({ id, dy }) => {
      const el = document.getElementById(id)!;
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2 + dy));
    },
    { id, dy },
  );
}

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a button drawn 32px tall still answers a finger 44px across", async ({ page }) => {
    test.skip(!css, "No production build in .next; run `npm run build` first.");
    await render(page);
    const h = await page.locator("#small").evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeLessThan(40); // drawn as it always was
    expect(await hitsBelow(page, "small", 20)).toBe(true);
    expect(await hitsBelow(page, "chip", 20)).toBe(true);
    // A chip that only names something is left alone: its hit area would
    // only get in the way of whatever is next to it.
    expect(await hitsBelow(page, "tag", 20)).toBe(false);
    // And no further than that.
    expect(await hitsBelow(page, "small", 30)).toBe(false);
  });
});

test("with a mouse, a button's target is the button as drawn", async ({ page }) => {
  test.skip(!css, "No production build in .next; run `npm run build` first.");
  await render(page);
  expect(await hitsBelow(page, "small", 20)).toBe(false);
});

for (const p of PALETTES) {
  for (const mode of ["light", "dark"] as const) {
    test(`${p.name} (${mode}): the focus ring is drawn and can be seen`, async ({ page }) => {
      test.skip(!css, "No production build in .next; run `npm run build` first.");
      await page.emulateMedia({ colorScheme: mode });
      await render(page, paletteCss(p.id), p.darkOnly ? "dark" : mode);
      await page.keyboard.press("Tab");
      const ring = await page.locator("#small").evaluate((e) => {
        const s = getComputedStyle(e);
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
      });
      expect(ring.style).toBe("solid");
      expect(ring.width).toBeGreaterThanOrEqual(2);
      const hex = (rgb: string) => "#" + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
      const bg = p[p.darkOnly ? "dark" : mode].bg;
      expect(contrast(hex(ring.color), bg), `ring ${hex(ring.color)} on ${bg}`).toBeGreaterThanOrEqual(3);
    });
  }
}

/** --color-accent-solid is one fixed blue in every theme, chosen to hold
 * white text as a fill. As a text colour, an outline, a ring or a pip it
 * fell to 2.0:1 on Nord dark and under 3:1 on most dark themes (wrap-up
 * check, 22 October), so those use the theme's own colours instead: the
 * link colour (--color-accent-700) and the focus colour (--color-focus). */
test("the fixed blue is only ever a fill, never a text colour or an outline", () => {
  test.skip(!css, "No production build in .next; run `npm run build` first.");
  const inCss = [...css!.matchAll(/(?:^|[;{])\s*(color|outline|border|stroke)\s*:[^;}]*var\(--color-accent-solid\)/g)]
    .map((m) => m[0].trim())
    // A 22% wash of it as a tile's edge is decoration, not a boundary that has to be seen.
    .filter((d) => !/color-mix\(/.test(d));
  expect(inCss).toEqual([]);
  const src = path.join(process.cwd(), "src");
  const files = (fs.readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
  const inTsx = files.flatMap((f) =>
    [...fs.readFileSync(path.join(src, f), "utf8").matchAll(/\b(color|colour|stroke|outline)\s*[:=]\s*"var\(--color-accent-solid\)"/g)].map((m) => `${f}: ${m[0]}`),
  );
  expect(inTsx).toEqual([]);
});
