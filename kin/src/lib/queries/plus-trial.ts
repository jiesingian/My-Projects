import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import type { CurrentMember } from "@/lib/session";

/** "Your days of Kin Plus have started" on Today (approved 6 October): three
 * Plus things to try while the trial is free, each ticked off by the family's
 * own records, the way "Start here" is.
 *
 * Grown-ups only, while the trial has more than three days left -- after
 * that the trial banner takes over (plus.tsx) -- and until all three are done
 * or the member hides it. Hiding is remembered on this phone in a cookie
 * named for the household, rather than in a column: the card lives for four
 * days at most, and a cookie lets the server leave it out without a flash. */

export const PLUS_TRIAL_CARD_COOKIE = "kin-plus-trial-card-hidden";

export type PlusTrialStep = {
  id: "bill" | "vault" | "medicine";
  title: string;
  hint: string;
  href: string;
  done: boolean;
};

export async function getPlusTrialCard(me: CurrentMember): Promise<{ steps: PlusTrialStep[]; daysLeft: number } | null> {
  if (!isGrownUp(me.role)) return null;
  const access = readAccess(me.families);
  if (!access.trialing || access.daysLeft === null || access.daysLeft <= 3) return null;
  if ((await cookies()).get(PLUS_TRIAL_CARD_COOKIE)?.value === me.family_id) return null;

  const supabase = await createClient();
  const count = (table: "bills" | "doc_entries" | "family_vault_items" | "health_medicines") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("family_id", me.family_id);
  const [bills, docs, vault, medicines] = await Promise.all([count("bills"), count("doc_entries"), count("family_vault_items"), count("health_medicines")]);

  const steps: PlusTrialStep[] = [
    { id: "bill", title: "Add a bill", hint: "Kin reminds you the day before it's due.", href: "/wealth?seg=cashflow", done: (bills.count ?? 0) > 0 },
    { id: "vault", title: "Put a document in the vault", hint: "A passport or birth certificate, behind Face ID.", href: "/family?seg=documents", done: (docs.count ?? 0) + (vault.count ?? 0) > 0 },
    { id: "medicine", title: "Add a medicine", hint: "Dose reminders for whoever takes it.", href: `/family/members/${me.id}/health/new`, done: (medicines.count ?? 0) > 0 },
  ];
  return steps.every((s) => s.done) ? null : { steps, daysLeft: access.daysLeft };
}
