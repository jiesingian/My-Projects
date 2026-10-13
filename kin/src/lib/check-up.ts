import { AREAS, PRIORITIES, type Area, type Priority } from "@/lib/first-open";

/** The family check-up on the signed-out home page (agreed 13 October, Group A
 * in docs/BACKLOG.md): nine questions, one per screen, and a Family Readiness
 * score worked out here in the browser by fixed rules. No AI, nothing sent.
 *
 * There is no wrong answer. A low bar means "this is where Kin helps most",
 * and every line written from it is the easy win, never "you're failing". */

export type Option = { id: string; label: string };

export type Question = {
  id: string;
  title: string;
  hint?: string;
  /** one: a single answer. many: any number. ranked: up to `max`, in the
   * order tapped (question 3's top 3). */
  kind: "one" | "many" | "ranked";
  max?: number;
  options: Option[];
  /** An option that clears the others, and is cleared by them. */
  alone?: string;
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  health: "Health & medicines",
  documents: "Documents",
  emergency: "Emergency info",
  kids: "Kids’ safety & location",
  plans: "Plans & schedules",
  meals: "Groceries & meals",
  money: "Money & bills",
  memories: "Family memories",
};

export const QUESTIONS: Question[] = [
  {
    id: "home",
    title: "Who’s at home?",
    hint: "Pick everyone you live with. Walang maling sagot.",
    kind: "many",
    alone: "solo",
    options: [
      { id: "partner", label: "Partner" },
      { id: "kids", label: "Kids under 13" },
      { id: "teens", label: "Teens" },
      { id: "lolo", label: "Lolo/Lola" },
      { id: "helper", label: "Kasambahay/yaya" },
      { id: "abroad", label: "Someone working abroad" },
      { id: "solo", label: "Just me for now" },
    ],
  },
  {
    id: "apps",
    title: "How many apps does your family use to stay organised?",
    hint: "The group chat, notes, calendars, that spreadsheet of bills.",
    kind: "one",
    options: [
      { id: "one", label: "1" },
      { id: "few", label: "2-3" },
      { id: "lots", label: "4 or more" },
      { id: "none", label: "We don’t really" },
    ],
  },
  {
    id: "top3",
    title: "Your top 3, in order",
    hint: "Tap the one that matters most first. Tap again to take it back.",
    kind: "ranked",
    max: 3,
    options: PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABELS[p] })),
  },
  {
    id: "sick",
    title: "If someone got sick at 2 a.m., how fast could you find their allergies, medicines, blood type and HMO card?",
    kind: "one",
    options: [
      { id: "minute", label: "Under a minute" },
      { id: "look", label: "I’d have to look" },
      { id: "ask", label: "I’d have to ask someone" },
      { id: "cant", label: "I couldn’t" },
    ],
  },
  {
    id: "papers",
    title: "Where are the PSA certificates, passports and insurance policies?",
    kind: "one",
    options: [
      { id: "folder", label: "One folder at home" },
      { id: "photos", label: "Photos on someone’s phone" },
      { id: "cloud", label: "In the cloud" },
      { id: "scattered", label: "All over the place" },
    ],
  },
  {
    id: "kids",
    title: "When the kids are out, how do you know they’re okay?",
    kind: "one",
    options: [
      { id: "message", label: "They message me" },
      { id: "calling", label: "I keep calling" },
      { id: "app", label: "We use a location app" },
      { id: "worry", label: "Honestly, I worry" },
    ],
  },
  {
    id: "busy",
    title: "What takes the most back-and-forth at home?",
    hint: "Up to 3.",
    kind: "ranked",
    max: 3,
    options: [
      { id: "meals", label: "Groceries & meals" },
      { id: "chores", label: "Chores" },
      { id: "school", label: "School & schedules" },
      { id: "bills", label: "Bills & budget" },
      { id: "savings", label: "Savings goals" },
    ],
  },
  {
    id: "chat",
    title: "What would your family actually use in a family chat?",
    hint: "Pick as many as you like.",
    kind: "many",
    options: [
      { id: "albums", label: "Photo albums" },
      { id: "polls", label: "Polls" },
      { id: "calls", label: "Voice/video calls" },
      { id: "journal", label: "A shared journal of events" },
      { id: "ai", label: "An AI helper that knows your family’s info" },
    ],
  },
  {
    id: "ai",
    title: "How do you feel about AI helping your family?",
    kind: "one",
    options: [
      { id: "ready", label: "Ready to try" },
      { id: "privacy", label: "Curious but privacy first" },
      { id: "no", label: "Not for me" },
    ],
  },
];

export type Answers = Record<string, string[]>;

/** Question 6 is only for homes with children in them. */
export function hasKids(answers: Answers): boolean {
  const home = answers.home ?? [];
  return home.includes("kids") || home.includes("teens");
}

/** The questions this visitor is asked, given what they have said so far. */
export function questionsFor(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => q.id !== "kids" || hasKids(answers));
}

/** What a tap on `option` makes of the current picks for `q`. A single
 * answer replaces; a ranked one appends (up to its max) or comes out, the
 * rest closing up behind it; "Just me for now" stands alone. */
export function toggle(q: Question, picked: string[], option: string): string[] {
  if (q.kind === "one") return [option];
  if (picked.includes(option)) return picked.filter((p) => p !== option);
  if (q.alone === option) return [option];
  const rest = q.alone ? picked.filter((p) => p !== q.alone) : picked;
  if (q.max && rest.length >= q.max) return rest;
  return [...rest, option];
}

/** Question 3's answer as priorities, first choice first, ignoring anything
 * that isn't one. */
export function topThree(answers: Answers): Priority[] {
  return (answers.top3 ?? []).filter((p): p is Priority => (PRIORITIES as readonly string[]).includes(p)).slice(0, 3);
}

/** Which bar each priority belongs to. Emergency info is part of Health &
 * safety; plans, meals and money are all running the home. */
export const PRIORITY_AREA: Record<Priority, Area> = {
  health: "health",
  emergency: "health",
  documents: "documents",
  kids: "kids",
  plans: "home",
  meals: "home",
  money: "home",
  memories: "close",
};

/** Where an unanswered question leaves its bar: the middle, neither praise
 * nor alarm. */
const UNKNOWN = 50;

const SICK: Record<string, number> = {
  minute: 90,
  look: 55,
  ask: 35,
  cant: 15,
};
const PAPERS: Record<string, number> = {
  cloud: 75,
  folder: 65,
  photos: 40,
  scattered: 15,
};
const KIDS: Record<string, number> = {
  app: 85,
  message: 65,
  calling: 40,
  worry: 20,
};
const APPS: Record<string, number> = { one: 80, few: 55, lots: 30, none: 35 };

const one = (answers: Answers, id: string, table: Record<string, number>): number | null => {
  const a = answers[id]?.[0];
  return a !== undefined && a in table ? table[a] : null;
};

/** Each bar, 0-100. Kids & location is left out when there are no children
 * at home, rather than scored as either perfect or empty. */
export function areaScores(answers: Answers): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};

  out.health = one(answers, "sick", SICK) ?? UNKNOWN;
  out.documents = one(answers, "papers", PAPERS) ?? UNKNOWN;
  if (hasKids(answers)) out.kids = one(answers, "kids", KIDS) ?? UNKNOWN;

  // Running the home: how scattered it is (question 2) and how much of it
  // takes back-and-forth (question 7), each half.
  const apps = one(answers, "apps", APPS) ?? UNKNOWN;
  const busy = answers.busy === undefined ? UNKNOWN : [85, 70, 55, 40][Math.min(answers.busy.length, 3)];
  out.home = Math.round((apps + busy) / 2);

  // Staying close: each thing they would use in a family chat is something
  // they don't have in one place yet, and someone working abroad makes it
  // matter more.
  const close = answers.chat === undefined ? UNKNOWN : 75 - 10 * answers.chat.length;
  out.close = Math.max(20, close - ((answers.home ?? []).includes("abroad") ? 10 : 0));

  return out;
}

/** Each bar counts once; the bars behind the visitor's top 3 count 3, 2 and
 * 1 more on top of that, first choice heaviest. */
export function areaWeights(answers: Answers): Record<Area, number> {
  const w = Object.fromEntries(AREAS.map((a) => [a, 1])) as Record<Area, number>;
  topThree(answers).forEach((p, i) => {
    w[PRIORITY_AREA[p]] += 3 - i;
  });
  return w;
}

/** The Family Readiness score out of 100. */
export function readinessScore(answers: Answers): number {
  const areas = areaScores(answers);
  const weights = areaWeights(answers);
  let sum = 0;
  let total = 0;
  for (const a of AREAS) {
    const v = areas[a];
    if (v === undefined) continue;
    sum += v * weights[a];
    total += weights[a];
  }
  return total ? Math.round(sum / total) : UNKNOWN;
}

export type ScoreLabel = "Getting started" | "On the way" | "Well connected";

export function scoreLabel(score: number): ScoreLabel {
  if (score >= 70) return "Well connected";
  if (score >= 40) return "On the way";
  return "Getting started";
}
