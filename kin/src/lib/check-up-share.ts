import { readinessScore, scoreCategory, type Answers } from "@/lib/check-up";
import { PROFILES, blueprintProfile } from "@/lib/blueprint";

/** The check-up result as a picture to share (19 October, Kin Free): the
 * score and its category, and -- only if the person ticks it -- the family
 * profile and its tagline, with Kin's name and the link to take the
 * check-up. Never an answer itself: who is at home, what worries them, how
 * many apps they juggle stay on the phone, as the check-up promises
 * (first-open.ts: nothing is sent). Drawn on the phone in share-result.tsx;
 * what goes on it is decided here, so the tests can hold it to that. */

/** 4:5, the shape Facebook and Instagram show whole in a feed. */
export const SHARE_SIZE = { w: 1080, h: 1350 } as const;

export type ShareChoice = { score: boolean; profile: boolean };

export type ShareCard = {
  eyebrow: string;
  title: string;
  score: { value: number; category: string; line: string } | null;
  profile: { name: string; tagline: string } | null;
  brand: string;
  cta: string;
  link: string;
};

/** The link a shared card points at: the check-up itself (`?start=quiz`, the
 * link ads use), on whatever address Kin is served from. */
export function checkUpLink(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/?start=quiz`;
}

export function shareCard(answers: Answers, choice: ShareChoice, origin: string): ShareCard {
  const value = readinessScore(answers);
  const category = scoreCategory(value);
  const profile = PROFILES[blueprintProfile(answers)];
  return {
    eyebrow: "Family life, decoded.",
    title: "Our Family’s Digital Blueprint",
    score: choice.score ? { value, category: category.name, line: category.line } : null,
    profile: choice.profile ? { name: profile.name, tagline: profile.tagline } : null,
    brand: "Kin",
    cta: "Take the 1-minute family check-up",
    link: checkUpLink(origin).replace(/^https?:\/\//, ""),
  };
}

/** The words that go with the picture in the share sheet. */
export function shareText(card: ShareCard, origin: string): string {
  const what = card.score ? `We got ${card.score.value}/100: ${card.score.category}.` : card.profile ? `We're ${card.profile.name}.` : "We took the family check-up.";
  return `${what} ${card.cta} on Kin: ${checkUpLink(origin)}`;
}

export const SHARE_FILE_NAME = "kin-family-blueprint.png";
