import { test, expect, type Page } from "@playwright/test";

/** Today and Chat on a mid-range Android over 4G, measured (speed pass,
 * 19 October).
 *
 * Chrome's own throttling: the CPU four times slower (Lighthouse's mobile
 * setting) and "Fast 4G" -- 150 ms round trip, 1.6 Mbps down. Each page is
 * loaded cold, and the numbers are written to the report rather than held to
 * a line: dev's database answers at a different speed every run, so a time
 * limit would fail for reasons that have nothing to do with the page. What is
 * held to a line is the JavaScript itself (bundle-budget.logic.spec.ts).
 *
 * Read-only, as the sample household. */

type Timing = { fcp: number; lcp: number; dcl: number; load: number; jsKB: number; longTasksMs: number };

async function measure(page: Page, path: string): Promise<Timing> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __long: number };
    w.__lcp = 0;
    w.__long = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__long += Math.max(0, e.duration - 50)))).observe({ type: "longtask", buffered: true });
  });
  await page.goto(path, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const w = window as unknown as { __lcp: number; __long: number };
    return { fcp, lcp: w.__lcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, longTasksMs: w.__long };
  });
  const jsBytes = await page.evaluate(() =>
    (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => r.initiatorType === "script" || r.name.endsWith(".js")).reduce((n, r) => n + (r.encodedBodySize || 0), 0),
  );
  await cdp.detach();
  return { ...t, jsKB: Math.round(jsBytes / 1024) };
}

for (const path of ["/today", "/chat/household"]) {
  test(`${path} on a throttled phone`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const t = await measure(page, path);
    const line = `${path}: FCP ${Math.round(t.fcp)} ms, LCP ${Math.round(t.lcp)} ms, DOMContentLoaded ${Math.round(t.dcl)} ms, load ${Math.round(t.load)} ms, JS ${t.jsKB} KB, long tasks ${Math.round(t.longTasksMs)} ms over 50`;
    info.annotations.push({ type: "speed", description: line });
    console.log(line);
    // Only that it rendered at all; the numbers are the point.
    expect(t.fcp).toBeGreaterThan(0);
  });
}
