/** The family starter pack (Janine, 20 October): goals for two grown-ups, a
 * young child and a baby, the family's weekly goals, and rewards. Data only
 * -- added to a household by a parent pressing a button (lib/actions/game
 * addFamilyPackAction), into their own household, never by a migration,
 * seed or test. Every goal and reward can be edited, turned off or removed
 * afterwards. */

import type { GameCategory } from "@/lib/game";

export const PACK_ROLES = ["mum", "dad", "child", "baby"] as const;
export type PackRole = (typeof PACK_ROLES)[number];

export const PACK_ROLE_LABEL: Record<PackRole, string> = {
  mum: "Mum",
  dad: "Dad",
  child: "Young child",
  baby: "Baby",
};

export type PackGoal = {
  title: string;
  category: GameCategory;
  kind: "custom" | "steps";
  period: "day" | "week";
  /** A "Done" check is a target of 1. */
  target: number;
  unit: string;
  xp: number;
  coins: number;
  /** ISO weekdays (1 = Monday); absent: every day. */
  days?: number[];
  backup?: boolean;
  /** Whose the XP and coins are: the owner's, or the grown-up who ticked it. */
  creditTo?: "owner" | "logger";
  /** A child's big picture. */
  emoji?: string;
  /** Linked from the family's stroller walk (one walk, counted here too). */
  strollerLinked?: boolean;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const done = (title: string, category: GameCategory, extra: Partial<PackGoal> = {}): PackGoal => ({ title, category, kind: "custom", period: "day", target: 1, unit: "done", xp: 10, coins: 5, ...extra });
const backup: PackGoal = done("10 minutes of movement (backup)", "move", { backup: true, xp: 5, coins: 0 });

export const PACK_GOALS: Record<PackRole, PackGoal[]> = {
  mum: [
    done("Workout · 20 minutes", "move"),
    { title: "Steps", category: "move", kind: "steps", period: "day", target: 7000, unit: "steps", xp: 10, coins: 5 },
    done("Stand-and-stretch breaks", "move", { target: 3, unit: "breaks", days: WEEKDAYS }),
    done("Water", "water", { target: 8, unit: "glasses" }),
    done("Lights out on time", "sleep"),
    backup,
    done("Strength sessions", "move", { period: "week", target: 2, unit: "sessions", xp: 20, coins: 10 }),
  ],
  dad: [
    done("Activity · 30 minutes", "move"),
    { title: "Steps", category: "move", kind: "steps", period: "day", target: 8000, unit: "steps", xp: 10, coins: 5 },
    done("Desk stretch breaks", "move", { target: 3, unit: "breaks", days: WEEKDAYS }),
    done("Vegetables at lunch and dinner", "food", { target: 2, unit: "meals" }),
    done("No phone 30 minutes before bed", "unplug"),
    backup,
    done("Try a new exercise or beat a personal best", "move", { period: "week", xp: 20, coins: 10 }),
  ],
  child: [
    done("Play outside or dance · 60 minutes", "outdoor", { emoji: "🌳" }),
    done("Eat a fruit and a vegetable", "food", { target: 2, unit: "pieces", emoji: "🍎" }),
    done("Drink water", "water", { target: 7.5, unit: "cups", emoji: "💧" }),
    done("Bedtime story, then sleep on time", "sleep", { emoji: "📖" }),
  ],
  baby: [
    done("Floor play walking practice", "move", { emoji: "🧸", creditTo: "logger" }),
    done("Read a book together", "reading", { emoji: "📚", creditTo: "logger" }),
    done("Outdoor time or stroller walk", "outdoor", { emoji: "🌳", creditTo: "logger", strollerLinked: true }),
    done("Try a new food or texture", "food", { emoji: "🥄", creditTo: "logger" }),
  ],
};

/** The household's weekly goals: everyone's taps add to one target. */
export const PACK_FAMILY_GOALS: (PackGoal & { stroller?: boolean })[] = [
  { ...done("Stroller walk together", "outdoor", { period: "week", target: 3, unit: "walks", xp: 0, coins: 0 }), stroller: true },
  done("Dinner together, no phones", "family", { period: "week", target: 5, unit: "dinners", xp: 0, coins: 0 }),
  done("Weekend park or playground trip", "outdoor", { period: "week", target: 1, unit: "trip", xp: 0, coins: 0 }),
  { title: "Parents' steps this week", category: "family", kind: "steps", period: "week", target: 100_000, unit: "steps", xp: 0, coins: 0 },
];

export type PackReward = { title: string; coins: number; budget?: number; unlock?: "family_week" };

/** Rewards are the household's shelf: anyone may ask for any of them, so
 * each says whom it is meant for. Prices can be changed afterwards. */
export const PACK_REWARDS: { child: PackReward[]; grownUps: PackReward[]; family: PackReward[] } = {
  child: [
    { title: "Choose the bedtime story", coins: 20 },
    { title: "An extra park trip", coins: 40 },
    { title: "Pick the weekend snack", coins: 30 },
    { title: "A new sticker sheet", coins: 60, budget: 50 },
  ],
  grownUps: [
    { title: "Solo coffee break", coins: 50 },
    { title: "Sleep in on a weekend", coins: 100 },
    { title: "Choose the family movie", coins: 50 },
    { title: "Date night", coins: 300, budget: 1000 },
  ],
  family: [{ title: "Special breakfast out (all family goals this week)", coins: 1, budget: 800, unlock: "family_week" }],
};

/** What the pack adds, given who is who and whether the household has Kin
 * Plus (steps goals need it). Goals a person already has by the same name
 * are left alone, so pressing it twice adds nothing twice. */
export function packGoalsFor(roles: Partial<Record<PackRole, string>>, opts: { plus: boolean; existing: { ownerId: string | null; title: string }[] }) {
  const has = new Set(opts.existing.map((e) => `${e.ownerId ?? "family"}|${e.title.toLowerCase()}`));
  const keep = (g: PackGoal, owner: string | null) => (opts.plus || g.kind !== "steps") && !has.has(`${owner ?? "family"}|${g.title.toLowerCase()}`);
  const personal = PACK_ROLES.flatMap((role) => {
    const owner = roles[role];
    if (!owner) return [];
    return PACK_GOALS[role].filter((g) => keep(g, owner)).map((g) => ({ ...g, owner, role }));
  });
  const anyone = Object.values(roles).some(Boolean);
  const family = anyone ? PACK_FAMILY_GOALS.filter((g) => keep(g, null)).map((g) => ({ ...g, owner: null as string | null, role: null })) : [];
  const skippedForPlus = opts.plus ? 0 : PACK_ROLES.filter((r) => roles[r]).flatMap((r) => PACK_GOALS[r]).filter((g) => g.kind === "steps").length + (anyone ? PACK_FAMILY_GOALS.filter((g) => g.kind === "steps").length : 0);
  return { personal, family, skippedForPlus };
}
