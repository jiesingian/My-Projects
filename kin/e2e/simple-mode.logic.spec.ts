import { test, expect } from "@playwright/test";
import { dynamicTypeScale, effectiveTextScale, textScaleCss } from "@/lib/text-scale";
import { inSimpleMode, simpleModeTextScale, simplePlans } from "@/lib/simple-mode";
import type { BriefItem } from "@/lib/queries/today";

/** Simple Kin and iOS Dynamic Type (19 October).
 *
 * Simple Kin is a per-person switch for grown-ups over 60: bigger targets,
 * text at least 130%, and a Today of medicines, plans, family and SOS.
 * Dynamic Type is the iPhone's own text size, read from the size Safari gives
 * `-apple-system-body` (17px at the phone's default). */

test("the iPhone's default text size is Kin's 100%", () => {
  expect(dynamicTypeScale(17)).toBe(100);
});

test("larger iPhone sizes become the nearest step of five", () => {
  // xL, xxL, xxxL, and the first two Accessibility sizes.
  expect(dynamicTypeScale(19)).toBe(110);
  expect(dynamicTypeScale(21)).toBe(125);
  expect(dynamicTypeScale(23)).toBe(135);
  expect(dynamicTypeScale(28)).toBe(165);
  expect(dynamicTypeScale(33)).toBe(195);
});

test("the largest Accessibility sizes stop at the slider's 300%", () => {
  expect(dynamicTypeScale(53)).toBe(300);
  expect(dynamicTypeScale(80)).toBe(300);
});

test("a size that could not be read changes nothing", () => {
  expect(dynamicTypeScale(NaN)).toBeNull();
  expect(dynamicTypeScale(0)).toBeNull();
  expect(effectiveTextScale(120, null)).toBe(120);
});

test("the phone only ever makes Kin larger, never smaller than the slider", () => {
  expect(effectiveTextScale(100, 135)).toBe(135);
  expect(effectiveTextScale(150, 100)).toBe(150);
  // A phone set smaller than default (xS, 14px) leaves the slider alone.
  expect(effectiveTextScale(100, dynamicTypeScale(14))).toBe(100);
});

test("the layout switches move with the phone's size, not only the root", () => {
  // At 135% the tab bar's labels go at 14 x 1.35 = 18.9em, not 14em; a
  // stylesheet that scaled the root alone would leave labels on at 320px.
  const css = textScaleCss(effectiveTextScale(100, 135));
  expect(css).toContain(":root{font-size:135%}");
  expect(css).toContain("@media (max-width:18.9em)");
});

test("turning Simple Kin on raises text to 130%, and never lowers it", () => {
  expect(simpleModeTextScale(100)).toBe(130);
  expect(simpleModeTextScale(85)).toBe(130);
  expect(simpleModeTextScale(175)).toBe(175);
});

test("kid view wins over Simple Kin; anyone else gets it when it is on", () => {
  expect(inSimpleMode({ role: "adult", simple_mode: true })).toBe(true);
  expect(inSimpleMode({ role: "parent", simple_mode: false })).toBe(false);
  expect(inSimpleMode({ role: "adult" })).toBe(false);
  expect(inSimpleMode({ role: "child_self", kid_view: true, simple_mode: true })).toBe(false);
  expect(inSimpleMode({ role: "child_self", kid_view: false, simple_mode: true })).toBe(true);
});

test("the simple Today's plans leave out money, the list, and what is answered", () => {
  const item = (id: string, extra: Partial<BriefItem> = {}): BriefItem => ({ id, icon: "calendarDays", tint: "schedule", title: id, meta: "", href: "/planner", ...extra });
  const brief = [
    item("activity-1"),
    item("bill-1", { tint: "money", action: "pay" }),
    item("buy", { tint: "home", action: "shop" }),
    item("activity-2", { mark: "done" }),
    item("health-1", { tint: "occasion", icon: "activity", action: "done" }),
  ];
  expect(simplePlans(brief).map((b) => b.id)).toEqual(["activity-1", "health-1"]);
  expect(simplePlans(Array.from({ length: 10 }, (_, i) => item(`a-${i}`))).length).toBe(6);
});
