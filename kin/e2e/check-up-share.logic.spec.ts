import { test, expect } from "@playwright/test";
import { checkUpLink, shareCard, shareText } from "@/lib/check-up-share";
import { readinessScore, scoreCategory } from "@/lib/check-up";
import { PROFILES, blueprintProfile } from "@/lib/blueprint";

/** The check-up result as a picture: what is on it is only what the person
 * ticked, and never one of their answers. */

const answers = { home: ["kids", "lola"], top3: ["health", "documents", "money"], tools: ["calendar"], sick: ["minute"], papers: ["scattered"] };
const ORIGIN = "https://kin.example.ph/";

test("the score and its category by default; the profile only when ticked", () => {
  const card = shareCard(answers, { score: true, profile: false }, ORIGIN);
  const score = readinessScore(answers);
  expect(card.score).toEqual({ value: score, category: scoreCategory(score).name, line: scoreCategory(score).line });
  expect(card.profile).toBeNull();

  const both = shareCard(answers, { score: true, profile: true }, ORIGIN);
  const p = PROFILES[blueprintProfile(answers)];
  expect(both.profile).toEqual({ name: p.name, tagline: p.tagline });

  const neither = shareCard(answers, { score: false, profile: false }, ORIGIN);
  expect(neither.score).toBeNull();
  expect(neither.profile).toBeNull();
  expect(neither.title).toBe("Our Family’s Digital Blueprint");
});

test("Kin's name and the link to the check-up, never an answer", () => {
  const card = shareCard(answers, { score: true, profile: true }, ORIGIN);
  expect(card.brand).toBe("Kin");
  expect(card.link).toBe("kin.example.ph/?start=quiz");
  const everything = JSON.stringify(card) + shareText(card, ORIGIN);
  // Who is at home, the top 3 and the other answers stay on the phone.
  for (const word of ["kids", "lola", "Lolo", "health", "documents", "money", "calendar", "scattered"]) {
    expect(everything.toLowerCase()).not.toContain(word.toLowerCase());
  }
});

test("the words for the share sheet follow what is ticked", () => {
  const score = readinessScore(answers);
  const card = shareCard(answers, { score: true, profile: false }, ORIGIN);
  expect(shareText(card, ORIGIN)).toBe(`We got ${score}/100: ${scoreCategory(score).name}. Take the 1-minute family check-up on Kin: https://kin.example.ph/?start=quiz`);
  const profileOnly = shareCard(answers, { score: false, profile: true }, ORIGIN);
  expect(shareText(profileOnly, ORIGIN)).toMatch(/^We're The .+ Family\. /);
  expect(checkUpLink("http://localhost:3000")).toBe("http://localhost:3000/?start=quiz");
});
