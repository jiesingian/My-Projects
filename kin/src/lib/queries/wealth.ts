import { createClient } from "@/lib/supabase/server";

function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export async function getJointWealth(familyId: string) {
  const supabase = await createClient();
  const { month, year } = currentPeriod();

  const [{ data: period }, { data: accounts }] = await Promise.all([
    supabase
      .from("budget_periods")
      .select("*, budget_allocations(*)")
      .eq("family_id", familyId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),
    supabase.from("accounts").select("*").eq("family_id", familyId).eq("is_joint", true).order("created_at"),
  ]);

  return { period, accounts: accounts ?? [], month, year };
}

export async function getMyWealth(familyId: string, memberId: string) {
  const supabase = await createClient();
  const { month, year } = currentPeriod();

  const [{ data: target }, { data: accounts }] = await Promise.all([
    supabase
      .from("wealth_targets")
      .select("*")
      .eq("member_id", memberId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),
    supabase.from("accounts").select("*").eq("family_id", familyId).eq("is_joint", false).eq("owner_member_id", memberId).order("created_at"),
  ]);

  return { target, accounts: accounts ?? [], month, year };
}

export async function getGoals(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("*, owner:owner_member_id(full_name)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
