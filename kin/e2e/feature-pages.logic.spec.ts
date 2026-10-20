import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { FEATURE_PAGES, FEATURE_SLUGS, featurePage, featurePlanLine } from "@/lib/feature-pages";
import { FREE_FEATURES, PLUS_FEATURES } from "@/lib/plan-features";

/** The public feature pages (lib/feature-pages.ts): five, each with a
 * title and description a search result can show whole, three or four
 * screenshots that exist in public/, and a free-or-Plus line that agrees
 * with the plan lists. */

test("five pages, one slug each, all in the landing's footer order", () => {
  expect(FEATURE_SLUGS).toEqual(["paluwagan", "utang", "family-tree", "medicine-reminders", "monito-monita"]);
  expect(new Set(FEATURE_SLUGS).size).toBe(5);
  expect(featurePage("paluwagan")?.name).toBe("Paluwagan");
  expect(featurePage("nope")).toBeUndefined();
});

test("titles and descriptions fit a search result", () => {
  for (const p of FEATURE_PAGES) {
    expect(p.title.length, `${p.slug} title`).toBeLessThanOrEqual(62);
    expect(p.description.length, `${p.slug} description`).toBeLessThanOrEqual(165);
    expect(p.description.length, `${p.slug} description`).toBeGreaterThanOrEqual(80);
    expect(p.intro.length).toBeGreaterThanOrEqual(2);
    expect(p.how.length).toBeGreaterThanOrEqual(3);
    expect(p.questions.length).toBeGreaterThanOrEqual(2);
  }
});

test("three or four screenshots per page, each a real file with alt text and a caption", () => {
  for (const p of FEATURE_PAGES) {
    expect(p.shots.length, p.slug).toBeGreaterThanOrEqual(3);
    expect(p.shots.length, p.slug).toBeLessThanOrEqual(4);
    for (const s of p.shots) {
      expect(s.src.startsWith(`/features/${p.slug}/`), s.src).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), "public", s.src)), `${s.src} exists`).toBe(true);
      // Light: a phone screenshot as WebP, well under 100 KB each.
      expect(fs.statSync(path.join(process.cwd(), "public", s.src)).size, `${s.src} size`).toBeLessThan(100 * 1024);
      expect(s.alt.length).toBeGreaterThan(20);
      expect(s.caption.length).toBeGreaterThan(5);
    }
  }
});

test("related pages point at pages that exist, never at themselves", () => {
  for (const p of FEATURE_PAGES) for (const r of p.related) {
    expect(FEATURE_SLUGS).toContain(r);
    expect(r).not.toBe(p.slug);
  }
});

test("the free or Plus line agrees with the plan lists", () => {
  const plusList = PLUS_FEATURES.join(" ");
  const freeList = FREE_FEATURES.join(" ");
  expect(featurePage("paluwagan")?.plan).toBe("plus");
  expect(featurePage("utang")?.plan).toBe("plus");
  expect(plusList).toContain("paluwagan");
  expect(featurePage("medicine-reminders")?.plan).toBe("plus");
  expect(plusList).toContain("Medicines with dose reminders");
  expect(featurePage("family-tree")?.plan).toBe("free");
  expect(freeList).toContain("Family tree");
  expect(featurePage("monito-monita")?.plan).toBe("free");
  expect(featurePlanLine("free")).toContain("Kin Free");
  expect(featurePlanLine("plus")).toContain("₱149");
  expect(featurePlanLine("plus")).toContain("₱1,490");
  expect(featurePlanLine("plus")).toContain("7 days");
});
