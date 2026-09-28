import { test, expect } from "@playwright/test";
import { occasionHeadline, occasionMilestoneTitle } from "@/lib/occasions";

test("a birthday with a real year says the age", () => {
  expect(occasionHeadline("Lola Rosa", "birthday", 72)).toBe("Lola Rosa turns 72 today 🎂");
  expect(occasionHeadline("Lola Rosa's birthday", "birthday", 72)).toBe("Lola Rosa turns 72 today 🎂");
  expect(occasionHeadline("Lia’s Birthday", "birthday", 11)).toBe("Lia turns 11 today 🎂");
  expect(occasionHeadline("Birthday of Tito Ben", "birthday", 50)).toBe("Tito Ben turns 50 today 🎂");
});

test("a birthday without a year names whose day it is", () => {
  expect(occasionHeadline("Lola Rosa", "birthday", null)).toBe("It’s Lola Rosa’s birthday today 🎂");
  expect(occasionHeadline("Lola Rosa", "birthday", 0)).toBe("It’s Lola Rosa’s birthday today 🎂");
});

test("an anniversary counts its years", () => {
  expect(occasionHeadline("Marco & Tess", "anniversary", 15)).toBe("Marco & Tess: 15 years today 💍");
  expect(occasionHeadline("Our anniversary", "anniversary", 1)).toBe("Our anniversary: 1 year today 💍");
  expect(occasionHeadline("Our anniversary", "anniversary", null)).toBe("Our anniversary, today 💍");
  expect(occasionHeadline("Marco & Tess", "anniversary", null)).toBe("Marco & Tess’s anniversary is today 💍");
});

test("a marked occasion's milestone reads without 'today'", () => {
  expect(occasionMilestoneTitle("Lola Rosa's birthday", "birthday", 72)).toBe("Lola Rosa turns 72");
  expect(occasionMilestoneTitle("Lola Rosa", "birthday", null)).toBe("Lola Rosa’s birthday");
  expect(occasionMilestoneTitle("Marco & Tess", "anniversary", 25)).toBe("Marco & Tess: 25 years");
  expect(occasionMilestoneTitle("Our anniversary", "anniversary", null)).toBe("Our anniversary");
});
