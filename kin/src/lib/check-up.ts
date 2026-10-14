import { AREAS, PRIORITIES, type Area, type Priority } from "@/lib/first-open";

/** The family check-up on the signed-out home page (agreed 13 October, Group A
 * in docs/BACKLOG.md): nine questions, one per screen, and a Family Readiness
 * score worked out here in the browser by fixed rules. No AI, nothing sent.
 *
 * There is no wrong answer. A low bar means "this is where Kin helps most",
 * and every line written from it shows what could be easier, never "you're
 * failing". Every question needs an answer (Jonathan, 13 October: a skipped
 * question scored as the middle made an empty check-up read 50/100), so
 * each one has an answer for the family it doesn't fit. */

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
  health: "Family health and wellness",
  money: "Financial planning and budgeting",
  documents: "Important documents and records",
  plans: "Schedules, appointments and events",
  travel: "Travel and family adventures",
  memories: "Family memories and milestones",
  meals: "Household management",
  together: "Family connection and quality time",
  emergency: "Emergency information",
  kids: "Kids’ safety and location",
};

export const QUESTIONS: Question[] = [
  {
    id: "home",
    title: "Who makes up your household?",
    hint: "Every family is different. Let’s start with the people who share your home. Select everyone who currently lives with you.",
    kind: "many",
    alone: "solo",
    // Janine, 14 October. The ids carry on from the old list where the
    // answer means the same: "kids" (now under 18) still brings question 6,
    // and "helper" (the old "Household helper or nanny") is now "Other
    // household members". Grandparents became parents; "Someone working
    // abroad" went, since it isn't someone who lives with you.
    options: [
      { id: "solo", label: "Just me" },
      { id: "partner", label: "My Spouse or Partner" },
      { id: "kids", label: "My Kids under 18" },
      { id: "grown", label: "My Kids 18y/o up" },
      { id: "siblings", label: "My Siblings" },
      { id: "parents", label: "My Parents" },
      { id: "relatives", label: "Other relatives" },
      { id: "helper", label: "Other household members" },
    ],
  },
  {
    id: "tools",
    title: "How does your family keep track of things?",
    hint: "Plans, lists, bills and reminders. Pick everything you use, on a phone or on paper.",
    kind: "many",
    alone: "none",
    options: [
      { id: "chat", label: "A group chat (Messenger, Viber, WhatsApp)" },
      { id: "calendar", label: "A shared calendar app" },
      { id: "notes", label: "Notes or reminder apps" },
      { id: "sheet", label: "Spreadsheets" },
      { id: "paper", label: "Paper: a notebook, wall calendar or sticky notes" },
      { id: "memory", label: "We remember and remind each other" },
      { id: "none", label: "We don’t really keep track" },
    ],
  },
  {
    id: "top3",
    title: "What are your family’s top 3 priorities?",
    hint: "Choose the three areas of family life that matter most to you.",
    kind: "ranked",
    max: 3,
    options: PRIORITIES.map((p) => ({ id: p, label: PRIORITY_LABELS[p] })),
  },
  {
    id: "sick",
    title: "If a medical emergency happened today, how quickly can you access your family’s health history and records?",
    hint: "Think medical records, allergies, and medications.",
    kind: "one",
    // Janine, 14 October: the same four steps as before, fastest first, so
    // the ids and their scores carry over.
    options: [
      { id: "minute", label: "In seconds—we have everything organized and ready" },
      { id: "look", label: "Within a few minutes—we know where to look" },
      { id: "ask", label: "It would take some searching—I need to ask someone" },
      { id: "cant", label: "We’re not sure where everything is" },
    ],
  },
  {
    id: "papers",
    title: "Where’s that document?",
    hint: "Think birth certificates, passports, insurance policies, IDs and other records.",
    kind: "one",
    options: [
      { id: "safe", label: "In a safe or locked cabinet" },
      { id: "folder", label: "One folder at home" },
      { id: "photos", label: "Photos on someone’s phone" },
      { id: "cloud", label: "Scanned and saved online" },
      { id: "scattered", label: "In different places" },
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
    alone: "smooth",
    options: [
      { id: "meals", label: "Groceries & meals" },
      { id: "chores", label: "Chores" },
      { id: "school", label: "School & schedules" },
      { id: "bills", label: "Bills & budget" },
      { id: "savings", label: "Savings goals" },
      { id: "smooth", label: "Not much, it runs smoothly" },
    ],
  },
  {
    id: "chat",
    title: "What would your family actually use in a family chat?",
    hint: "Pick as many as you like.",
    kind: "many",
    alone: "nothing",
    options: [
      { id: "albums", label: "Photo albums" },
      { id: "polls", label: "Polls" },
      { id: "calls", label: "Voice/video calls" },
      { id: "journal", label: "A shared journal of events" },
      { id: "ai", label: "An AI helper that knows your family’s info" },
      { id: "nothing", label: "None of these" },
    ],
  },
  {
    id: "ai",
    title: "How do you feel about AI helping your family?",
    kind: "one",
    options: [
      { id: "regular", label: "I already use AI tools regularly" },
      { id: "ready", label: "Ready to try" },
      { id: "privacy", label: "Curious but privacy first" },
      { id: "no", label: "Not for me" },
    ],
  },
];

export type Answers = Record<string, string[]>;

/** Question 6 is only for homes with children under 18 in them. */
export function hasKids(answers: Answers): boolean {
  return (answers.home ?? []).includes("kids");
}

/** The questions this visitor is asked, given what they have said so far. */
export function questionsFor(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => q.id !== "kids" || hasKids(answers));
}

/** What a tap on `option` makes of the current picks for `q`. A single
 * answer replaces; a ranked one appends (up to its max) or comes out, the
 * rest closing up behind it; "Just me" stands alone. */
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

/** Which bar each priority belongs to. Emergency information is part of
 * Health & safety; plans, the household and money are all running the home;
 * travel, memories and time together are staying close. */
export const PRIORITY_AREA: Record<Priority, Area> = {
  health: "health",
  emergency: "health",
  kids: "kids",
  documents: "documents",
  plans: "home",
  meals: "home",
  money: "home",
  travel: "close",
  memories: "close",
  together: "close",
};

/** Where an unanswered question leaves its bar: the middle, neither praise
 * nor alarm. Only answers saved before a question changed get here now. */
const UNKNOWN = 50;

const SICK: Record<string, number> = {
  minute: 90,
  look: 55,
  ask: 35,
  cant: 15,
};
// Originals locked away are well kept; what they lack is a copy you can
// reach when you're away from home.
const PAPERS: Record<string, number> = {
  safe: 70,
  cloud: 75,
  folder: 60,
  photos: 40,
  scattered: 15,
};
const KIDS: Record<string, number> = {
  app: 85,
  message: 65,
  calling: 40,
  worry: 20,
};

const one = (answers: Answers, id: string, table: Record<string, number>): number | null => {
  const a = answers[id]?.[0];
  return a !== undefined && a in table ? table[a] : null;
};

/** The places question 2 says the family keeps track in, leaving out "we
 * remember" and "we don't", which aren't places. */
export function trackingPlaces(answers: Answers): string[] {
  return (answers.tools ?? []).filter((t) => t !== "memory" && t !== "none");
}

/** Question 2 as a bar: one place is organised; every extra place is one
 * more to check; nothing written down at all is where Kin helps most. */
function toolsScore(answers: Answers): number {
  const tools = answers.tools;
  if (!tools?.length) return UNKNOWN;
  const places = trackingPlaces(answers).length;
  if (places === 0) return tools.includes("memory") ? 35 : 25;
  return [70, 70, 60, 50, 40][Math.min(places, 4)];
}

/** Question 7 as a bar: the more that takes back-and-forth, the lower. */
function busyScore(answers: Answers): number {
  const busy = answers.busy;
  if (!busy?.length) return UNKNOWN;
  if (busy.includes("smooth")) return 85;
  return [85, 70, 55, 40][Math.min(busy.length, 3)];
}

/** Each bar, 0-100. Kids & location is left out when there are no children
 * at home, rather than scored as either perfect or empty. */
export function areaScores(answers: Answers): Partial<Record<Area, number>> {
  const out: Partial<Record<Area, number>> = {};

  out.health = one(answers, "sick", SICK) ?? UNKNOWN;
  out.documents = one(answers, "papers", PAPERS) ?? UNKNOWN;
  if (hasKids(answers)) out.kids = one(answers, "kids", KIDS) ?? UNKNOWN;

  // Running the home: how scattered it is (question 2) and how much of it
  // takes back-and-forth (question 7), each half.
  out.home = Math.round((toolsScore(answers) + busyScore(answers)) / 2);

  // Staying close: each thing they would use in a family chat is something
  // they don't have in one place yet.
  const chat = (answers.chat ?? []).filter((c) => c !== "nothing");
  out.close = Math.max(20, answers.chat?.length ? 75 - 10 * chat.length : UNKNOWN);

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

/** The results page's words (agreed 13 October). */

export const AREA_LABELS: Record<Area, string> = {
  health: "Health & safety",
  documents: "Documents",
  kids: "Kids & location",
  home: "Running the home",
  close: "Staying close",
};

/** One line under each bar. Below 70 it names what could be easier and
 * how; from 70 it says what is already working. It never tells a family it
 * is doing badly: the point is to notice, not to be told. */
const AREA_LINES: Record<Area, [string, string]> = {
  health: [
    "At 2 a.m., finding it shouldn’t depend on who’s awake. With everyone’s allergies, medicines, blood type and HMO card in one place, anyone at home can open it.",
    "You could find it fast. Kin makes that true for everyone at home, not just you.",
  ],
  documents: [
    "The originals can stay safely where they are. What helps is knowing what you have, and a copy you can reach when you’re away from home.",
    "Your papers are well kept. A copy in Kin’s vault, behind Face ID or a PIN, means you have them even when you’re away from home.",
  ],
  kids: [
    "Knowing they got home safe shouldn’t take ten calls. Location that each person chooses to share can do the asking for you.",
    "You’ve got a system. Kin puts it beside the family’s calendar and chat.",
  ],
  home: [
    "When plans, lists and bills live in different places, someone always ends up asking twice. One shared place takes that off everyone.",
    "The home runs well. Kin can save the last few back-and-forths.",
  ],
  close: [
    "Photos, polls and calls are easier to share when they sit next to everything else, from the grandparents to the youngest.",
    "You’re close already. Kin gives it a home, photos and all.",
  ],
};

export function areaLine(area: Area, score: number): string {
  return AREA_LINES[area][score >= 70 ? 1 : 0];
}

/** "You said X -> in Kin, Y", naming the real feature. `plus` marks the
 * ones that are Kin Plus after the trial, so nobody meets Plus later as a
 * surprise. */
export const PRIORITY_IN_KIN: Record<Priority, { line: string; plus?: boolean }> = {
  health: { line: "a health profile for each person: allergies, blood type, doctor, PhilHealth and insurance, on everyone’s phone." },
  emergency: { line: "the emergency card: blood type, allergies, doctor and insurance on one screen that reads at arm’s length." },
  kids: { line: "location sharing, which each person switches on for themselves, beside the family calendar." },
  money: { line: "Wealth: accounts, budgets and bills with reminders, and who’s paying what.", plus: true },
  documents: { line: "the vault: PSA certificates, passports and policies, behind Face ID or a PIN.", plus: true },
  plans: { line: "one family calendar, synced with Google Calendar, with appointments, routines and chores the kids earn stars for." },
  travel: { line: "trips in the planner: who’s going, a packing list, and the budget beside what was spent." },
  memories: { line: "the family journal: photos, milestones and first days, shared with relatives." },
  meals: { line: "a shared shopping list with prices, the pantry, meal plans and chores, so the house runs from one list." },
  together: { line: "the family chat, with polls and voice and video calls, right beside the calendar of what you’re doing together." },
};

/** From question 2: what Kin brings together. */
export function oneAppLine(answers: Answers): string {
  const tools = answers.tools ?? [];
  const places = trackingPlaces(answers).length;
  if (tools.includes("none")) return "One place to start, without having to set up a system first.";
  if (places === 0 && tools.includes("memory")) return "Less to carry in your heads: the dates, lists and bills in one place everyone can check.";
  if (places === 1) return "Already one place? Kin keeps it that way, with the calendar, lists and bills side by side.";
  if (places > 1) return `${places} places to keep track in today. In Kin, it’s one.`;
  return "One place for the whole family, instead of five.";
}

/** Shown when question 9 is "Curious but privacy first": the promise as
 * /legal/privacy makes it. */
export const PRIVACY_LINE = "Private to your family. Nothing is sold, and your records never train AI.";

export function wantsPrivacyFirst(answers: Answers): boolean {
  return answers.ai?.[0] === "privacy";
}

/** What Kin does about an answer, shown under the question once it is
 * answered (Jonathan, 13 October: each answer should show the feature that
 * helps with it, not wait for the end). Only features Kin has today, in the
 * words of plan-features.ts and PRIORITY_IN_KIN. `plus` as there. */
export type Tip = { line: string; plus?: boolean };

const HOME_TIPS: [string, Tip][] = [
  ["parents", { line: "Each person gets a health profile with their medicines and allergies, and an emergency card that reads at arm’s length." }],
  ["kids", { line: "Kids get their own kid view: chores they earn stars for, and rewards they can save up for." }],
  ["grown", { line: "Grown-up kids get the family calendar, lists and chat on their own phone, and choose for themselves whether to share their location." }],
  ["helper", { line: "One shared shopping list, pantry and meal plan, so everyone who runs the house works from the same list." }],
  ["siblings", { line: "Brothers and sisters see the same calendar, lists and bills, so nobody has to ask twice." }],
  ["relatives", { line: "Everyone under one roof sees the same calendar, lists and family chat, from their own phone." }],
  ["partner", { line: "You and your spouse or partner see the same calendar, lists and bills, so nobody has to ask twice." }],
  ["solo", { line: "Start on your own, and invite the others with a code whenever you’re ready." }],
];

const BUSY_TIPS: Record<string, Tip> = {
  meals: { line: PRIORITY_IN_KIN.meals.line },
  chores: { line: "chores with stars and rewards, given out and ticked off in the app, so nobody has to remind twice." },
  school: { line: PRIORITY_IN_KIN.plans.line },
  bills: PRIORITY_IN_KIN.money,
  savings: { line: "Wealth: accounts, budgets and net worth in one view, so everyone can see how the savings are going.", plus: true },
  smooth: { line: "the calendar, the list and the chores shared by everyone, so it stays that way." },
};

const CHAT_TIPS: Record<string, Tip> = {
  albums: { line: PRIORITY_IN_KIN.memories.line },
  journal: { line: PRIORITY_IN_KIN.memories.line },
  polls: { line: "polls in the family chat, to settle dinner or the weekend in a minute." },
  calls: { line: "voice and video calls, built into the family chat." },
  ai: { line: "Kin AI, which answers from your own family’s calendar, lists and records. Your records never train AI." },
  nothing: { line: "a family chat that’s there when you want it, next to the calendar and lists it talks about." },
};

export function answerTip(id: string, answers: Answers): Tip | null {
  const picked = answers[id] ?? [];
  if (!picked.length) return null;
  const first = picked[0];
  switch (id) {
    case "home":
      return HOME_TIPS.find(([o]) => picked.includes(o))?.[1] ?? null;
    case "tools":
      if (picked.includes("none") || (picked.length === 1 && first === "memory"))
        return { line: "Kin keeps the family calendar, the shopping list and bill reminders in one place, so nobody has to carry it all in their head." };
      if (picked.includes("paper"))
        return { line: "Keep the wall calendar if you love it. Kin puts the same plans on everyone’s phone, and Kin AI can read a school flyer for you." };
      if (picked.length === 1 && first === "chat")
        return { line: "Kin has its own family chat, with polls and calls, right next to the calendar and lists it’s talking about." };
      return { line: "The calendar (synced with Google Calendar), the lists, the chat and the bills, all in one place everyone shares." };
    case "top3": {
      const p = topThree(answers)[0];
      return p ? { line: `In Kin, ${PRIORITY_IN_KIN[p].line}`, plus: PRIORITY_IN_KIN[p].plus } : null;
    }
    case "sick":
      return first === "minute"
        ? { line: "Kin keeps it that fast for everyone at home: allergies, medicines, blood type and HMO details on each person’s health profile." }
        : { line: "Each person’s allergies, medicines, blood type, doctor and HMO card on their health profile, and an emergency card that shows it all on one screen." };
    case "papers":
      if (first === "safe" || first === "folder")
        return { line: "Keep the originals where they are. A copy in the vault, behind Face ID or a PIN, is there when you’re away from home.", plus: true };
      if (first === "photos") return { line: "Instead of searching someone’s camera roll, keep each document in the vault, named, with whose it is.", plus: true };
      if (first === "cloud") return { line: "The vault keeps them beside the rest of the family’s life, behind Face ID or a PIN.", plus: true };
      return { line: "Start with one: add a document to the vault and it’s there for whoever needs it, behind Face ID or a PIN.", plus: true };
    case "kids":
      return first === "app"
        ? { line: "Kin’s location sharing sits next to the family calendar and chat, so that’s one app less." }
        : { line: "Location sharing that each person switches on for themselves, next to the family calendar, so you know where everyone should be." };
    case "busy": {
      const t = BUSY_TIPS[first];
      return t ? { line: `In Kin, ${t.line}`, plus: t.plus } : null;
    }
    case "chat": {
      const t = CHAT_TIPS[first];
      return t ? { line: `In Kin, ${t.line}` } : null;
    }
    case "ai":
      if (first === "privacy") return { line: PRIVACY_LINE };
      if (first === "no") return { line: "That’s fine. Everything in Kin works without AI, and Kin AI only answers when someone asks it." };
      return { line: "Kin AI answers from your own family’s calendar, lists and records, and can read a school flyer for you. Your records never train AI." };
  }
  return null;
}

/** Whether `q` has been answered enough to move on. Nothing is skipped. */
export function answered(q: Question, answers: Answers): boolean {
  return (answers[q.id] ?? []).length > 0;
}

