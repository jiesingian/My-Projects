import { FREE_AI_PER_MONTH } from "@/lib/access";

/** What each plan holds, in the words of the proposal Jonathan approved on
 * 28 September. The database is what enforces it (require_kin_plus,
 * use_kin_ai); these are the lists people read before choosing -- on the plan
 * screen and, since 6 October, on the public home page before sign-up. One
 * list for both, so the two can never disagree. */
export const FREE_FEATURES: string[] = [
  "Family calendar, planner and Google Calendar sync",
  "Chores, stars, rewards and kid view",
  "Shopping list, pantry and meal plans",
  "Family chat, polls, voice and video calls",
  "Journal and photos, 1 GB",
  "Family tree and the relatives' feed",
  "Health profiles and the emergency card",
  `Kin AI and flyer scans, ${FREE_AI_PER_MONTH} a month`,
];

export const PLUS_FEATURES: string[] = [
  "Everything in Kin Free",
  "Wealth: accounts, budgets, bills and reminders, net worth",
  "The vault: documents and passwords behind Face ID",
  "Medicines with dose reminders, the illness log, vitals, growth charts, Apple Health",
  "Kin AI and flyer scans without a monthly limit",
  "50 GB for photos and files",
];
