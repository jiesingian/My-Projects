import { getCurrentMember } from "@/lib/session";
import type { PlusTrialStep } from "@/lib/queries/plus-trial";
import type { ChosenPlan } from "@/lib/first-open";
import { PlusTrialCardView } from "@/components/plus-trial-card-view";

/** Today's trial card, worded for the plan the household chose before it
 * existed (families.chosen_plan). The plan is read here, from the member the
 * page has already loaded (getCurrentMember is cached per request), so Today
 * passes the card exactly what it always did. */
export async function PlusTrialCard({ steps, daysLeft }: { steps: PlusTrialStep[]; daysLeft: number }) {
  const me = await getCurrentMember();
  const chosen = me?.families.chosen_plan;
  const plan: ChosenPlan | null = chosen === "plus" || chosen === "free" ? chosen : null;
  return <PlusTrialCardView steps={steps} daysLeft={daysLeft} plan={plan} />;
}
