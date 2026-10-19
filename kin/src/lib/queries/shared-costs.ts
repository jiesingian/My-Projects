import { createClient } from "@/lib/supabase/server";
import { potBalances, settleUp, type HouseholdBalance, type PotEntry, type PotHousehold, type Settlement } from "@/lib/shared-costs";

/** Shared pots the viewer's household is in. RLS returns nothing to a
 * child, and nothing once a link in the pot is revoked. */

export type SharedPotSummary = { id: string; title: string; note: string | null; households: PotHousehold[]; ours: HouseholdBalance | null; totalCost: number };

export type SharedPotEntryView = {
  id: string;
  kind: "cost" | "payment";
  familyId: string;
  familyName: string;
  toFamilyId: string | null;
  toFamilyName: string | null;
  amount: number;
  description: string;
  spentOn: string;
  authorName: string;
  ours: boolean;
};

export type SharedPotView = {
  id: string;
  title: string;
  note: string | null;
  startedByUs: boolean;
  households: PotHousehold[];
  balances: HouseholdBalance[];
  settlements: Settlement[];
  entries: SharedPotEntryView[];
  othersRecorded: boolean;
};

type HouseholdRow = { pot_id: string; family_id: string; family_name: string; share: number };
type EntryRow = { id: string; pot_id: string; kind: string; family_id: string; to_family_id: string | null; amount: number; description: string; spent_on: string; author_name: string };

const toHousehold = (h: HouseholdRow): PotHousehold => ({ familyId: h.family_id, name: h.family_name || "A linked household", share: Number(h.share) });
const toEntry = (e: EntryRow): PotEntry => ({ kind: e.kind === "payment" ? "payment" : "cost", familyId: e.family_id, toFamilyId: e.to_family_id, amount: Number(e.amount) });

export async function getSharedPots(familyId: string): Promise<SharedPotSummary[]> {
  const supabase = await createClient();
  const { data: pots } = await supabase.from("shared_pots").select("id, title, note, created_at").order("created_at", { ascending: false });
  if (!pots?.length) return [];
  const ids = pots.map((p) => p.id);
  const [{ data: households }, { data: entries }] = await Promise.all([
    supabase.from("shared_pot_households").select("pot_id, family_id, family_name, share").in("pot_id", ids).order("joined_at"),
    supabase.from("shared_pot_entries").select("id, pot_id, kind, family_id, to_family_id, amount, description, spent_on, author_name").in("pot_id", ids),
  ]);
  return pots.map((p) => {
    const hh = (households ?? []).filter((h) => h.pot_id === p.id).map(toHousehold);
    const es = (entries ?? []).filter((e) => e.pot_id === p.id);
    const balances = potBalances(hh, es.map(toEntry));
    return {
      id: p.id,
      title: p.title,
      note: p.note,
      households: hh,
      ours: balances.find((b) => b.familyId === familyId) ?? null,
      totalCost: balances.reduce((n, b) => n + b.paid, 0),
    };
  });
}

export async function getSharedPot(potId: string, familyId: string): Promise<SharedPotView | null> {
  const supabase = await createClient();
  const [{ data: pot }, { data: households }, { data: entries }] = await Promise.all([
    supabase.from("shared_pots").select("id, title, note, created_by_family").eq("id", potId).maybeSingle(),
    supabase.from("shared_pot_households").select("pot_id, family_id, family_name, share").eq("pot_id", potId).order("joined_at"),
    supabase
      .from("shared_pot_entries")
      .select("id, pot_id, kind, family_id, to_family_id, amount, description, spent_on, author_name")
      .eq("pot_id", potId)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (!pot) return null;
  const hh = (households ?? []).map(toHousehold);
  const nameOf = new Map(hh.map((h) => [h.familyId, h.name]));
  const balances = potBalances(hh, (entries ?? []).map(toEntry));
  return {
    id: pot.id,
    title: pot.title,
    note: pot.note,
    startedByUs: pot.created_by_family === familyId,
    households: hh,
    balances,
    settlements: settleUp(balances),
    othersRecorded: (entries ?? []).some((e) => e.family_id !== familyId),
    entries: (entries ?? []).map((e) => ({
      id: e.id,
      kind: e.kind === "payment" ? "payment" : "cost",
      familyId: e.family_id,
      familyName: nameOf.get(e.family_id) ?? "A household no longer in the pot",
      toFamilyId: e.to_family_id,
      toFamilyName: e.to_family_id ? (nameOf.get(e.to_family_id) ?? null) : null,
      amount: Number(e.amount),
      description: e.description,
      spentOn: e.spent_on,
      authorName: e.author_name,
      ours: e.family_id === familyId,
    })),
  };
}
