"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getMemberScores } from "@/lib/queries/routines";
import { getAlkansya } from "@/lib/queries/alkansya";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { JARS, interestOn, pointsToPesos, splitPesos, splitProblem, withdrawalProblem, type Jar } from "@/lib/alkansya";
import type { ActionState } from "@/lib/actions/auth";

/** The alkansya is the grown-ups' record of the cash they hand over and
 * keep (20261019100000). The database refuses a child's write whatever this
 * file says; these checks are so a grown-up reads a sentence, not a policy. */
async function grownUp() {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { me, error: "Only a parent or another adult keeps the alkansya." };
  return { me, error: null };
}

function refresh(memberId: string) {
  revalidatePath("/planner/alkansya");
  revalidatePath(`/planner/alkansya/${memberId}`);
  revalidatePath("/planner");
  revalidatePath("/today");
}

const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").replace(/,/g, ""));

const today = (me: { families: { time_zone?: string | null } }) => familyDay(new Date(), me.families.time_zone || undefined);

/** The weekly baon, its payday, the split, what a point is worth and the
 * interest rate. Any baon already due is paid at the old amount first, so
 * a change never reaches back into weeks that have gone. */
export async function saveAlkansyaPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const memberId = String(formData.get("member_id") ?? "");
  const weekly = num(formData, "weekly_amount");
  const weekday = num(formData, "pay_weekday");
  const split = { gastos: num(formData, "gastos_pct"), ipon: num(formData, "ipon_pct"), bigay: num(formData, "bigay_pct") };
  const rate = num(formData, "peso_per_point");
  const interest = num(formData, "interest_pct");
  const active = formData.get("active") !== "off";

  if (!(weekly >= 0 && weekly <= 100000)) return { error: "The weekly baon is from 0 to 100,000." };
  if (!(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) return { error: "Choose the day the baon is given." };
  const bad = splitProblem(split);
  if (bad) return { error: bad };
  if (!(rate >= 0 && rate <= 1000)) return { error: "A point is worth from 0 to 1,000." };
  if (!(interest >= 0 && interest <= 100)) return { error: "Interest is a percent from 0 to 100." };

  const supabase = await createClient();
  await supabase.rpc("alkansya_pay_allowances");
  const { error: dbError } = await supabase.from("alkansya_plans").upsert(
    {
      member_id: memberId,
      family_id: me.family_id,
      weekly_amount: Math.round(weekly * 100) / 100,
      pay_weekday: weekday,
      gastos_pct: split.gastos,
      ipon_pct: split.ipon,
      bigay_pct: split.bigay,
      peso_per_point: Math.round(rate * 100) / 100,
      interest_pct: Math.round(interest * 100) / 100,
      active,
      created_by: me.id,
    },
    { onConflict: "member_id" },
  );
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}

/** Points changed into pesos at the plan's rate, split across the jars the
 * way the baon is. The points are spent, the same as a reward: checked
 * against what is left, which already holds requests still waiting. */
export async function convertPointsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const memberId = String(formData.get("member_id") ?? "");
  const points = num(formData, "points");
  if (!(Number.isInteger(points) && points > 0 && points <= 100000)) return { error: "Enter a whole number of points." };

  const [alkansya, scores] = await Promise.all([getAlkansya(me.family_id, memberId), getMemberScores(me.family_id)]);
  if (!alkansya) return { error: "That child isn't in your household." };
  if (!alkansya.plan || !(alkansya.plan.pesoPerPoint > 0)) return { error: "Set what a point is worth first." };
  const spendable = scores.find((s) => s.id === memberId)?.spendable ?? 0;
  if (points > spendable) return { error: `There ${spendable === 1 ? "is" : "are"} only ${spendable} point${spendable === 1 ? "" : "s"} to change.` };

  const pesos = pointsToPesos(points, alkansya.plan.pesoPerPoint);
  const parts = splitPesos(pesos, alkansya.plan.split);
  const rows = JARS.filter((j) => parts[j] > 0);
  if (rows.length === 0) return { error: "That many points is worth less than a centavo." };

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("alkansya_entries").insert(
    rows.map((jar, i) => ({
      family_id: me.family_id,
      member_id: memberId,
      jar,
      kind: "points",
      amount: parts[jar],
      // One conversion, one count of points: on the first row only.
      points: i === 0 ? points : 0,
      note: `${points} point${points === 1 ? "" : "s"}`,
      occurred_on: today(me),
      recorded_by: me.id,
    })),
  );
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}

/** Money put in by hand -- a pamasko from a ninong, birthday money. */
export async function addToJarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const memberId = String(formData.get("member_id") ?? "");
  const jar = String(formData.get("jar") ?? "") as Jar;
  const amount = num(formData, "amount");
  if (!JARS.includes(jar)) return { error: "Choose a jar." };
  if (!(amount > 0 && amount <= 100000)) return { error: "Enter how much, up to 100,000." };

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("alkansya_entries").insert({
    family_id: me.family_id,
    member_id: memberId,
    jar,
    kind: "deposit",
    amount: Math.round(amount * 100) / 100,
    note: clamp(String(formData.get("note") ?? ""), 200) || null,
    occurred_on: today(me),
    recorded_by: me.id,
  });
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}

/** Money taken out: spent from gastos or ipon, or given from bigay. */
export async function takeFromJarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const memberId = String(formData.get("member_id") ?? "");
  const jar = String(formData.get("jar") ?? "") as Jar;
  const amount = Math.round(num(formData, "amount") * 100) / 100;
  const kind = jar === "bigay" ? "give" : "spend";
  if (!JARS.includes(jar)) return { error: "Choose a jar." };

  const alkansya = await getAlkansya(me.family_id, memberId);
  if (!alkansya) return { error: "That child isn't in your household." };
  const problem = withdrawalProblem(kind, jar, amount, alkansya.balances[jar]);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("alkansya_entries").insert({
    family_id: me.family_id,
    member_id: memberId,
    jar,
    kind,
    amount: -amount,
    note: clamp(String(formData.get("note") ?? ""), 200) || null,
    occurred_on: today(me),
    recorded_by: me.id,
  });
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}

/** The plan's interest on what ipon holds today, added to ipon. */
export async function addInterestAction(memberId: string): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const alkansya = await getAlkansya(me.family_id, memberId);
  if (!alkansya?.plan) return { error: "Set up the alkansya first." };
  const amount = interestOn(alkansya.balances.ipon, alkansya.plan.interestPct);
  if (!(amount > 0)) return { error: alkansya.plan.interestPct > 0 ? "Ipon is empty, so there is nothing to add interest to." : "Set an interest rate first." };

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("alkansya_entries").insert({
    family_id: me.family_id,
    member_id: memberId,
    jar: "ipon",
    kind: "interest",
    amount,
    note: `${alkansya.plan.interestPct}% of ${alkansya.balances.ipon.toFixed(2)}`,
    occurred_on: today(me),
    recorded_by: me.id,
  });
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}

/** Taking a line off, for a mistake. A conversion of points comes off
 * whole, every jar's share at once, and gives the points back. Taking off
 * money that has since been spent would leave a jar below nothing, so that
 * is refused. */
export async function removeAlkansyaEntryAction(entryId: string, memberId: string): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const alkansya = await getAlkansya(me.family_id, memberId);
  const entry = alkansya?.entries.find((e) => e.id === entryId);
  if (!alkansya || !entry) return { error: "That line is no longer there." };
  const going = entry.kind === "points" ? alkansya.entries.filter((e) => e.kind === "points" && e.createdAt === entry.createdAt) : [entry];
  if (going.some((e) => e.amount > 0 && alkansya.balances[e.jar] - e.amount < 0)) {
    return { error: "Some of that has already been spent or given, so it can't be taken off." };
  }

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("alkansya_entries")
    .delete()
    .in("id", going.map((e) => e.id))
    .eq("family_id", me.family_id);
  if (dbError) return { error: humanDatabaseError(dbError.message) };

  refresh(memberId);
  return { error: null };
}
