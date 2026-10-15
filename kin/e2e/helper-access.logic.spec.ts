import { test, expect } from "@playwright/test";
import { helperLanding, mealsForTwoDays, namesSaid, normaliseHelperCode, plansForTwoDays, switchesSummary } from "@/lib/helper-access";
import { helperJoinUrl } from "@/lib/qr";

/** Helper access for the kasambahay, yaya or driver (14 October). The
 * database decides what a helper may see; these are the sums around it. */

const TZ = "Asia/Manila";
// 14 October 2026, 9:00 in Manila.
const NOW = new Date("2026-10-14T01:00:00Z");

test("a helper code is ten characters without 0/O or 1/I; spaces, dashes and case are forgiven", () => {
  expect(normaliseHelperCode("k7m2-qdxp 4r")).toBe("K7M2QDXP4R");
  expect(normaliseHelperCode("K7M2QDXP4")).toBeNull();
  expect(normaliseHelperCode("K7M2QDXP4R5")).toBeNull();
  expect(normaliseHelperCode("K7M2QDXP0R")).toBeNull();
  expect(normaliseHelperCode("K7M2QDXP1R")).toBeNull();
  expect(normaliseHelperCode(null)).toBeNull();
});

test("the helper link is its own path, not the household's join link", () => {
  expect(helperJoinUrl("https://kin.app", "K7M2QDXP4R")).toBe("https://kin.app/helper/join/K7M2QDXP4R");
  expect(helperJoinUrl("https://kin.app", "K7M2/../x")).toBe("https://kin.app/helper/join/K7M2x");
});

test("what a helper sees, in a few words", () => {
  expect(switchesSummary({ list: true, meals: true, kids: false })).toBe("To-Buy list · Meals");
  expect(switchesSummary({ list: false, meals: false, kids: true })).toBe("Children's plans");
  expect(switchesSummary({ list: false, meals: false, kids: false })).toBe("Sees nothing yet");
});

test("a waiting link goes first, then the helper page, else setting up their own Kin", () => {
  expect(helperLanding({ hasInviteCookie: true, helps: 1 })).toBe("accept");
  expect(helperLanding({ hasInviteCookie: false, helps: 2 })).toBe("helper");
  expect(helperLanding({ hasInviteCookie: false, helps: 0 })).toBe("onboarding");
});

test("meals: today's and tomorrow's, each in the order of the day", () => {
  const rows = [
    { plan_date: "2026-10-14", slot: "dinner", dish: "Sinigang", meal_position: 0 },
    { plan_date: "2026-10-14", slot: "breakfast", dish: "Tapsilog", meal_position: 0 },
    { plan_date: "2026-10-15", slot: "lunch", dish: "Adobo", meal_position: 1 },
    { plan_date: "2026-10-15", slot: "lunch", dish: "Kanin", meal_position: 0 },
    { plan_date: "2026-10-16", slot: "lunch", dish: "Too late", meal_position: 0 },
  ];
  const m = mealsForTwoDays(rows, "2026-10-14");
  expect(m.today.map((x) => `${x.label}: ${x.dish}`)).toEqual(["Breakfast: Tapsilog", "Dinner: Sinigang"]);
  expect(m.tomorrow.map((x) => x.dish)).toEqual(["Kanin", "Adobo"]);
});

test("children's plans: one-offs on their day, repeats moved to today or tomorrow at the same time", () => {
  const rows = [
    // 3:30 PM Manila today.
    { title: "School pick-up", start_at: "2026-10-14T07:30:00Z", end_at: "2026-10-14T08:00:00Z", repeat: "once", place: "Ateneo", children: ["Ana"] },
    // Started a week ago tomorrow (a Thursday), weekly, 9 AM Manila.
    { title: "Swimming", start_at: "2026-10-08T01:00:00Z", end_at: null, repeat: "weekly", place: " ", children: ["Ana", "Ben"] },
    // Started on the 15th of last month, monthly.
    { title: "Dentist", start_at: "2026-09-15T02:00:00Z", end_at: null, repeat: "monthly", place: "Clinic", children: ["Ben"] },
    // Weekly on Mondays: neither today (Wednesday) nor tomorrow.
    { title: "Piano", start_at: "2026-10-05T09:00:00Z", end_at: null, repeat: "weekly", place: null, children: ["Ana"] },
    // Next week.
    { title: "Field trip", start_at: "2026-10-21T00:00:00Z", end_at: null, repeat: "once", place: null, children: ["Ben"] },
  ];
  const plans = plansForTwoDays(rows, NOW, TZ);
  expect(plans.map((p) => `${p.day} ${p.title}`)).toEqual(["today School pick-up", "tomorrow Swimming", "tomorrow Dentist"]);
  const swim = plans.find((p) => p.title === "Swimming")!;
  expect(swim.at.toISOString()).toBe("2026-10-15T01:00:00.000Z");
  expect(swim.place).toBeNull();
  expect(plans[0].endAt?.toISOString()).toBe("2026-10-14T08:00:00.000Z");
});

test("a weekly plan on chosen days, and one that has ended", () => {
  const rows = [
    // First on Monday 5 October, every Monday, Wednesday and Friday, 7 AM.
    { title: "Tutor", start_at: "2026-10-04T23:00:00Z", end_at: null, repeat: "weekly", repeat_days: [1, 3, 5], repeat_until: null, place: null, children: ["Ana"] },
    // Every Wednesday, but it stopped yesterday.
    { title: "Ballet", start_at: "2026-09-30T02:00:00Z", end_at: null, repeat: "weekly", repeat_days: null, repeat_until: "2026-10-13", place: null, children: ["Ben"] },
    // Every Thursday until tomorrow, inclusive.
    { title: "Chess", start_at: "2026-10-08T08:00:00Z", end_at: null, repeat: "weekly", repeat_days: null, repeat_until: "2026-10-15", place: null, children: ["Ben"] },
  ];
  const plans = plansForTwoDays(rows, NOW, TZ);
  expect(plans.map((p) => `${p.day} ${p.title}`)).toEqual(["today Tutor", "tomorrow Chess"]);
  expect(plans[0].at.toISOString()).toBe("2026-10-13T23:00:00.000Z");
});

test("the day is Manila's, not the server's", () => {
  // Half past midnight on the 15th in Manila is still the 14th in UTC. The
  // 6 AM bus that morning is today's, not tomorrow's.
  const late = new Date("2026-10-14T16:30:00Z");
  const rows = [{ title: "Early bus", start_at: "2026-10-14T22:00:00Z", end_at: null, repeat: "once", place: null, children: ["Ana"] }];
  expect(plansForTwoDays(rows, late, TZ).map((p) => p.day)).toEqual(["today"]);
});

test("children's names said plainly", () => {
  expect(namesSaid(["Ana"])).toBe("Ana");
  expect(namesSaid(["Ana", "Ben"])).toBe("Ana and Ben");
  expect(namesSaid(["Ana", "Ben", "Cara"])).toBe("Ana, Ben and Cara");
});
