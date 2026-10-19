import { createClient } from "@/lib/supabase/server";
import { jarBalances, DEFAULT_SPLIT, type AlkansyaKind, type Jar, type Split } from "@/lib/alkansya";
import { isChild } from "@/lib/roles";
import { isGone } from "@/lib/member-status";

export type AlkansyaPlan = {
  weeklyAmount: number;
  payWeekday: number;
  split: Split;
  pesoPerPoint: number;
  interestPct: number;
  active: boolean;
};

export type AlkansyaEntry = {
  id: string;
  jar: Jar;
  kind: AlkansyaKind;
  amount: number;
  points: number;
  note: string | null;
  occurredOn: string;
  /** One conversion of points writes a row per jar in one statement, so
   * they share this. */
  createdAt: string;
};

export type ChildAlkansya = {
  memberId: string;
  name: string;
  plan: AlkansyaPlan | null;
  balances: Split & { total: number };
};

/** Every baon that has come round is written before anything is read, so
 * the jars on screen are never a week behind (alkansya_pay_allowances). */
async function payWhatIsDue() {
  const supabase = await createClient();
  await supabase.rpc("alkansya_pay_allowances");
  return supabase;
}

function readPlan(p: {
  weekly_amount: number;
  pay_weekday: number;
  gastos_pct: number;
  ipon_pct: number;
  bigay_pct: number;
  peso_per_point: number;
  interest_pct: number;
  active: boolean;
}): AlkansyaPlan {
  return {
    weeklyAmount: Number(p.weekly_amount),
    payWeekday: p.pay_weekday,
    split: { gastos: p.gastos_pct, ipon: p.ipon_pct, bigay: p.bigay_pct },
    pesoPerPoint: Number(p.peso_per_point),
    interestPct: Number(p.interest_pct),
    active: p.active,
  };
}

/** The children's jars, for the grown-ups' overview. A child asking gets
 * only their own back -- the database's rule, not this one's. */
export async function getChildrenAlkansya(familyId: string): Promise<ChildAlkansya[]> {
  const supabase = await payWhatIsDue();
  const [{ data: members }, { data: plans }, { data: rows }] = await Promise.all([
    supabase.from("members").select("id, full_name, role, status").eq("family_id", familyId).order("created_at"),
    supabase.from("alkansya_plans").select("*").eq("family_id", familyId),
    supabase.from("alkansya_entries").select("member_id, jar, amount").eq("family_id", familyId),
  ]);
  return (members ?? [])
    .filter((m) => isChild(m.role) && m.status !== "pending" && !isGone(m.status))
    .map((m) => {
      const plan = (plans ?? []).find((p) => p.member_id === m.id);
      return {
        memberId: m.id,
        name: m.full_name,
        plan: plan ? readPlan(plan) : null,
        balances: jarBalances((rows ?? []).filter((r) => r.member_id === m.id)),
      };
    });
}

/** One child's alkansya: the plan, the jars, and every entry, newest first.
 * Null when the caller may not see it. */
export async function getAlkansya(familyId: string, memberId: string) {
  const supabase = await payWhatIsDue();
  const [{ data: member }, { data: plan }, { data: rows }] = await Promise.all([
    supabase.from("members").select("id, full_name, role").eq("family_id", familyId).eq("id", memberId).maybeSingle(),
    supabase.from("alkansya_plans").select("*").eq("member_id", memberId).maybeSingle(),
    supabase
      .from("alkansya_entries")
      .select("id, jar, kind, amount, points, note, occurred_on, created_at")
      .eq("member_id", memberId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!member || !isChild(member.role)) return null;
  const entries: AlkansyaEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    jar: r.jar as Jar,
    kind: r.kind as AlkansyaKind,
    amount: Number(r.amount),
    points: r.points,
    note: r.note,
    occurredOn: r.occurred_on,
    createdAt: r.created_at,
  }));
  return {
    name: member.full_name,
    plan: plan ? readPlan(plan) : null,
    balances: jarBalances(rows ?? []),
    entries,
  };
}

export const NEW_PLAN: AlkansyaPlan = { weeklyAmount: 0, payWeekday: 1, split: DEFAULT_SPLIT, pesoPerPoint: 0, interestPct: 0, active: true };
