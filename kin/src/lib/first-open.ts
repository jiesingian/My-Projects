/** What a visitor told Kin before they had an account: the family check-up's
 * answers, its score, and the plan they chose (agreed 13 October; the whole
 * flow is in docs/BACKLOG.md, "Agreed 13 October: first open").
 *
 * Kept in this browser only and never sent anywhere (Jonathan, 13 October,
 * answer 9A). The public pages write it; sign-up, the plan step, Start here and
 * the guided tour read it to put the visitor's own priorities first. Anything
 * reading it must cope with it being missing: another phone, a private
 * window, or someone who skipped the check-up. */
export const FIRST_OPEN_KEY = "kin-first-open";

/** The ten things question 3 ranks. Order here is the order on screen.
 * Janine's list of 14 October. Ids carried over where the meaning did, so a
 * top 3 saved before then still reads: "meals" is now Household management. */
export const PRIORITIES = ["health", "money", "documents", "plans", "travel", "memories", "meals", "together", "emergency", "kids"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** The five bars on the results page. */
export const AREAS = ["health", "documents", "kids", "home", "close"] as const;
export type Area = (typeof AREAS)[number];

export type ChosenPlan = "plus" | "free";

export type FirstOpen = {
  version: 1;
  /** Question id to the option ids picked, in the order picked. */
  answers: Record<string, string[]>;
  /** Question 3, first choice first. Empty when skipped. */
  top3: Priority[];
  /** 0-100, and each area 0-100. Null until the check-up is finished. */
  score: number | null;
  areas: Partial<Record<Area, number>>;
  /** The plan step's choice. Everyone starts on the trial either way. */
  plan: ChosenPlan | null;
};

export function readFirstOpen(): FirstOpen | null {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRST_OPEN_KEY) ?? "null") as FirstOpen | null;
    return raw?.version === 1 ? raw : null;
  } catch {
    // Nothing saved, storage refused, or something unreadable: start fresh.
    return null;
  }
}

/** Merges into what is already saved, so each step writes only its part. */
export function writeFirstOpen(part: Partial<Omit<FirstOpen, "version">>): void {
  const now = readFirstOpen() ?? { version: 1, answers: {}, top3: [], score: null, areas: {}, plan: null };
  try {
    localStorage.setItem(FIRST_OPEN_KEY, JSON.stringify({ ...now, ...part, version: 1 }));
  } catch {
    // A private window: the flow still works, it just isn't tailored later.
  }
}
