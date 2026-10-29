// Makes Kin's Google Play art and Android launcher icons from public/icon.svg,
// with the Chromium that Playwright already has. Run from kin/:
//   node native/android/store/make-art.mjs
// Writes store/icon-512.png, store/feature-graphic.png and the app's
// adaptive launcher icons (res/mipmap-*). Re-run after the icon changes.
// Google Play wants the 512 icon as a 32-bit PNG (with alpha) and the
// feature graphic without: python3 -c "from PIL import Image; i=Image.open('native/android/store/icon-512.png'); i.convert('RGBA').save(i.filename)"

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, "../app/src/main/res");
const svg = readFileSync(join(here, "../../../public/icon.svg"), "utf8");
// The icon's own parts: its background, and the house without it.
const inner = svg.replace(/^[\s\S]*?<g id="art">/, "").replace(/<\/g>\s*<\/svg>\s*$/, "");
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
const background = `<rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#h)"/>`;
if (!inner.includes(background)) throw new Error("public/icon.svg changed shape: update make-art.mjs");
const house = inner.replace(background, "");

const page = (w, h, body) =>
  `<!doctype html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}</style></head><body>${body}</body></html>`;
const frame = (size, content, scale = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024" style="display:block">${defs}<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${content}</g></svg>`;

// CHROMIUM=/path/to/chrome when Playwright's own browser is not installed.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
async function shot(w, h, html, file, transparent = false) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  mkdirSync(dirname(file), { recursive: true });
  await p.screenshot({ path: file, omitBackground: transparent });
  await p.close();
}

// Google Play: 512 x 512, the whole icon (Play rounds the corners itself).
await shot(512, 512, page(512, 512, frame(512, inner)), join(here, "icon-512.png"));

// Google Play's feature graphic: 1024 x 500, no transparency.
await shot(
  1024,
  500,
  page(
    1024,
    500,
    `<div style="width:1024px;height:500px;background:linear-gradient(110deg,#FF9A4D,#E8436A);display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff">
      <div style="flex:none;width:300px;height:300px;border-radius:64px;overflow:hidden;box-shadow:0 18px 50px rgba(120,20,40,.35)">${frame(300, inner)}</div>
      <div><div style="font-size:112px;font-weight:800;letter-spacing:-2px;line-height:1">Kin</div>
      <div style="font-size:38px;font-weight:600;line-height:1.2;margin-top:18px;max-width:560px">Your family's day, in one place.</div>
      <div style="font-size:26px;line-height:1.35;margin-top:16px;opacity:.92;max-width:560px">Plans, lists, chat and calls, medicines that ring like an alarm, and the household's money.</div></div>
    </div>`,
  ),
  join(here, "feature-graphic.png"),
);

// Adaptive launcher icon (Android 8+): 108dp layers, the house inside the
// 66dp safe zone, so no launcher's mask cuts it. And the old square and
// round icons for older phones.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const layer = Math.round(108 * k);
  const legacy = Math.round(48 * k);
  await shot(layer, layer, page(layer, layer, frame(layer, house, 0.62)), join(res, `mipmap-${d}/ic_launcher_foreground.png`), true);
  await shot(layer, layer, page(layer, layer, frame(layer, background)), join(res, `mipmap-${d}/ic_launcher_background.png`));
  const clip = (radius) => `<div style="width:${legacy}px;height:${legacy}px;border-radius:${radius};overflow:hidden">${frame(legacy, inner)}</div>`;
  await shot(legacy, legacy, page(legacy, legacy, clip(`${legacy * 0.2}px`)), join(res, `mipmap-${d}/ic_launcher.png`), true);
  await shot(legacy, legacy, page(legacy, legacy, clip("50%")), join(res, `mipmap-${d}/ic_launcher_round.png`), true);
}
await browser.close();
console.log("Made store/icon-512.png, store/feature-graphic.png and the launcher icons.");
