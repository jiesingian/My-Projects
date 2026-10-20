#!/usr/bin/env node
// A budget for what a phone downloads before each page of Kin is usable.
//
// Reads the production build in .next (run `npm run build` first) and, for
// every route, adds up the gzipped size of its first-load client JavaScript:
// the framework's own files (build-manifest.json, rootMainFiles) plus the
// chunks of the route's layouts and page (page_client-reference-manifest.js,
// entryJSFiles). That is what a mid-range Android on 4G fetches before the
// page can respond to a tap. #710 (19 October) got the shell from 247 KB to
// 176 KB by keeping supabase-js out of the layouts; this keeps it out.
//
// The baseline, bundle-baseline.json, is main's numbers. A route may grow by
// 10% or 25 KB, whichever is larger, before this fails; a route that is not in
// the baseline yet is reported, never failed (CLAUDE.md: a new gate fails only
// on new debt). Growing a route on purpose is fine: refresh the baseline in
// the same pull request and say why.
//
//   npm run bundle:baseline            # build, then rewrite the baseline
//   node scripts/bundle-budget.mjs     # compare the build in .next with it
//   node scripts/bundle-budget.mjs --report out.md   # also write a Markdown
//                                      # table of what changed (CI posts it)
//
// Sizes differ by a few bytes between machines (the public Supabase URL is
// inlined into a client chunk), so the report lists only changes of 1 KB or
// more and the budget has the margin above. e2e/bundle-budget.logic.spec.ts
// keeps its fixed caps for the shell and Today; this is the per-route check.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const NEXT = path.join(process.cwd(), ".next");
const BASELINE = path.join(process.cwd(), "bundle-baseline.json");
const args = process.argv.slice(2);
const write = args.includes("--write");
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;

const GROWTH_RATIO = 0.10;
const GROWTH_KB = 25;
const REPORT_KB = 1;

if (!fs.existsSync(path.join(NEXT, "build-manifest.json")) || !fs.existsSync(path.join(NEXT, "app-path-routes-manifest.json"))) {
  console.error("No production build in .next: run `npm run build` first.");
  process.exit(2);
}

const buildManifest = JSON.parse(fs.readFileSync(path.join(NEXT, "build-manifest.json"), "utf8"));
const routes = JSON.parse(fs.readFileSync(path.join(NEXT, "app-path-routes-manifest.json"), "utf8"));

const gzipped = new Map();
function sizeOf(file) {
  if (!gzipped.has(file)) {
    const p = path.join(NEXT, file.replace(/^\/?_next\//, ""));
    gzipped.set(file, fs.existsSync(p) ? zlib.gzipSync(fs.readFileSync(p)).length : 0);
  }
  return gzipped.get(file);
}

/** Gzipped bytes of a route's first load, or null when the build has no
 * client manifest for it (an API route, a metadata file). */
function firstLoad(appPath) {
  const manifestFile = path.join(NEXT, "server/app", appPath.replace(/\/page$/, ""), "page_client-reference-manifest.js");
  if (!fs.existsSync(manifestFile)) return null;
  const g = {};
  new Function("globalThis", fs.readFileSync(manifestFile, "utf8"))(g);
  const entries = Object.values(g.__RSC_MANIFEST ?? {})[0]?.entryJSFiles ?? {};
  const files = new Set(buildManifest.rootMainFiles ?? []);
  // Layouts, templates and the page itself: what loads before first paint.
  // error and not-found entries are fetched only when needed.
  for (const [key, list] of Object.entries(entries)) if (/\/(layout|template|page)$/.test(key)) for (const f of list) files.add(f);
  let bytes = 0;
  for (const f of files) bytes += sizeOf(f);
  return bytes;
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const current = {};
for (const [appPath, route] of Object.entries(routes)) {
  if (!appPath.endsWith("/page")) continue;
  const bytes = firstLoad(appPath);
  if (bytes !== null) current[route] = kb(bytes);
}
const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));

if (write) {
  fs.writeFileSync(BASELINE, JSON.stringify({
    _comment: "First-load client JS per route, gzipped KB, from `npm run build` on main. Refresh with `npm run bundle:baseline` in the pull request that grows a route on purpose, and say why. scripts/bundle-budget.mjs compares a build against this.",
    routes: sorted,
  }, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(sorted).length} routes to bundle-baseline.json.`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).routes ?? {} : null;
if (!baseline) {
  console.log("::warning::bundle-baseline.json is missing; nothing to compare with. Run `npm run bundle:baseline`.");
  for (const [route, size] of Object.entries(sorted)) console.log(`  ${size.toFixed(1).padStart(7)} KB  ${route}`);
  process.exit(0);
}

const rows = [];
let failures = 0;
for (const [route, size] of Object.entries(sorted)) {
  const was = baseline[route];
  if (was === undefined) {
    rows.push({ route, was: null, now: size, delta: size, status: "new" });
    continue;
  }
  const delta = Math.round((size - was) * 10) / 10;
  const allowed = Math.max(was * GROWTH_RATIO, GROWTH_KB);
  const over = delta > allowed;
  if (over) failures++;
  if (Math.abs(delta) >= REPORT_KB || over) rows.push({ route, was, now: size, delta, status: over ? "over" : delta > 0 ? "grew" : "shrank" });
}
for (const route of Object.keys(baseline)) if (!(route in sorted)) rows.push({ route, was: baseline[route], now: null, delta: -baseline[route], status: "gone" });

const sign = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
const lines = [];
const total = Object.values(sorted).reduce((a, b) => a + b, 0);
const totalWas = Object.entries(baseline).filter(([r]) => r in sorted).reduce((a, [, v]) => a + v, 0);
lines.push(`${Object.keys(sorted).length} routes, ${total.toFixed(0)} KB of first-load JS in all (baseline ${totalWas.toFixed(0)} KB over the same routes).`);
if (rows.length === 0) lines.push("No route changed by 1 KB or more against the baseline.");
else {
  lines.push("", "| Route | Baseline | Now | Change | |", "|---|---:|---:|---:|---|");
  for (const r of rows) {
    const mark = r.status === "over" ? `**over budget** (allowed +${Math.max(r.was * GROWTH_RATIO, GROWTH_KB).toFixed(1)} KB)` : r.status === "new" ? "new route, no baseline yet" : r.status === "gone" ? "route gone" : "";
    lines.push(`| \`${r.route}\` | ${r.was === null ? "–" : r.was.toFixed(1)} | ${r.now === null ? "–" : r.now.toFixed(1)} | ${r.now === null || r.was === null ? "–" : sign(r.delta)} | ${mark} |`);
  }
  lines.push("", "Gzipped KB; what a phone downloads before the page is usable. A route may grow by 10% or 25 KB, whichever is larger. To grow one on purpose: `npm run bundle:baseline` in `kin/` and say why in the pull request.");
}
const text = lines.join("\n");
console.log(text.replace(/\*\*/g, "").replace(/`/g, ""));
if (reportPath) fs.writeFileSync(reportPath, text + "\n");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${rows.length > 0}\nover=${failures > 0}\n`);

for (const r of rows) {
  if (r.status === "over") console.log(`::error::${r.route} grew from ${r.was} KB to ${r.now} KB of first-load JS (${sign(r.delta)} KB; allowed +${Math.max(r.was * GROWTH_RATIO, GROWTH_KB).toFixed(1)} KB). Trim it, or refresh the baseline on purpose: npm run bundle:baseline.`);
  if (r.status === "new") console.log(`::notice::${r.route} is a new route (${r.now} KB first load) with no baseline yet; the next bundle:baseline will add it.`);
}
process.exit(failures ? 1 : 0);
