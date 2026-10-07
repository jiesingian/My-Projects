import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { familyDay } from "@/lib/time";
import { subscriptionsFrom, yearlyTotal, type RepeatingRow } from "@/lib/subscriptions";

/** The Subscriptions page: repeating charges (bills) and repeating money in
 * (income schedules), each with its yearly total.
 *
 * A private account is its owner's alone (e2e/private-accounts.spec.ts).
 * Bills and income schedules are the household's and every member reads
 * them, but one can be tied to an account -- the account an income lands
 * in, the account a bill was paid from. Such a row is kept only when the
 * viewer can see that account, which the accounts policy decides (RLS, read
 * here as the viewer); otherwise it is left out entirely, from the list and
 * from every total, so nothing about a private account shows to anyone
 * else. Its owner, if they chose to leave private accounts out of their own
 * "All" totals, gets the same here. */
export async function getSubscriptions(familyId: string) {
  const supabase = await createClient();
  const [me, { data: accounts }, { data: bills }, { data: income }] = await Promise.all([
    getCurrentMember(),
    supabase.from("accounts").select("id, is_private, owner_member_id").eq("family_id", familyId),
    supabase.from("bills").select("id, name, amount, recurrence, due_date, status, paid_at, category, paid_from_account_id").eq("family_id", familyId),
    supabase.from("income_schedules").select("id, name, amount, recurrence, next_date, status, category, account_id").eq("family_id", familyId),
  ]);

  const leaveOutMine = me?.wealth_include_private === false ? me.id : null;
  const usable = new Set((accounts ?? []).filter((a) => !(leaveOutMine && a.is_private && a.owner_member_id === leaveOutMine)).map((a) => a.id));
  const allowed = (accountId: string | null) => accountId === null || usable.has(accountId);

  const charges: RepeatingRow[] = (bills ?? [])
    .filter((b) => allowed(b.paid_from_account_id))
    .map((b) => ({ id: b.id, name: b.name, amount: b.amount, recurrence: b.recurrence, date: b.due_date, settled: b.status === "paid" || !!b.paid_at, category: b.category }));
  const incoming: RepeatingRow[] = (income ?? [])
    .filter((s) => allowed(s.account_id))
    .map((s) => ({ id: s.id, name: s.name, amount: s.amount, recurrence: s.recurrence, date: s.next_date, settled: s.status === "received", category: s.category }));

  const today = familyDay(new Date());
  const out = subscriptionsFrom(charges, today);
  const inn = subscriptionsFrom(incoming, today);
  return { today, charges: out, chargesPerYear: yearlyTotal(out), income: inn, incomePerYear: yearlyTotal(inn) };
}
