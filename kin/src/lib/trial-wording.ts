import type { ChosenPlan } from "@/lib/first-open";

/** What the card says under its title, by the plan chosen before sign-up
 * (families.chosen_plan, agreed 13 October). Everyone is on the same trial;
 * only the words differ. Null -- an older household, or one that skipped the
 * check-up -- keeps the wording from before. */
export function trialLine(plan: ChosenPlan | null, daysLeft: number): string {
  if (plan === "plus") return `${daysLeft} days left to try these free. No card: nothing is charged unless you subscribe yourself.`;
  if (plan === "free") return `You chose Kin Free. These Plus extras are yours to try for ${daysLeft} more days, then everything you add stays.`;
  return `${daysLeft} days left to try these free. Afterwards everything you add stays yours.`;
}
