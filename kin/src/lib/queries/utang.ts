import { createClient } from "@/lib/supabase/server";
import { utangLeft, type PaluwaganFrequency, type UtangDirection } from "@/lib/utang";

export type UtangView = {
  id: string;
  direction: UtangDirection;
  personName: string;
  amount: number;
  startedOn: string;
  dueOn: string | null;
  /** Agreed as instalments (20261022180000): how many, how often, the first
   * one's date. All null otherwise. */
  instalments: number | null;
  instalmentFrequency: PaluwaganFrequency | null;
  firstDueOn: string | null;
  note: string | null;
  isPrivate: boolean;
  remind: boolean;
  mine: boolean;
  paid: number;
  left: number;
  settled: boolean;
  payments: { id: string; amount: number; paidOn: string; note: string | null }[];
};

/** Every utang the caller may see -- the household grown-ups' ones and
 * their own "just me" ones; the database decides which -- open ones first,
 * then by when they started. */
export async function getUtang(familyId: string, meId: string): Promise<UtangView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("utang_entries")
    .select("*, utang_payments(id, amount, paid_on, note)")
    .eq("family_id", familyId)
    .order("started_on", { ascending: false });
  const rows = (data ?? []).map((u) => {
    const payments = (u.utang_payments ?? [])
      .map((p) => ({ id: p.id, amount: Number(p.amount), paidOn: p.paid_on, note: p.note }))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
    const amount = Number(u.amount);
    return {
      id: u.id,
      direction: u.direction as UtangDirection,
      personName: u.person_name,
      amount,
      startedOn: u.started_on,
      dueOn: u.due_on,
      instalments: u.instalments,
      instalmentFrequency: u.instalment_frequency as PaluwaganFrequency | null,
      firstDueOn: u.first_due_on,
      note: u.note,
      isPrivate: u.is_private,
      remind: u.remind,
      mine: u.recorded_by === meId,
      ...utangLeft(amount, payments),
      payments,
    };
  });
  return [...rows.filter((r) => !r.settled), ...rows.filter((r) => r.settled)];
}

export type PaluwaganMemberView = { id: string; name: string; turn: number; isUs: boolean };

export type PaluwaganView = {
  id: string;
  name: string;
  contribution: number;
  frequency: PaluwaganFrequency;
  startsOn: string;
  note: string | null;
  isPrivate: boolean;
  remind: boolean;
  mine: boolean;
  members: PaluwaganMemberView[];
  /** "memberId:round" for every hulog in. */
  paid: Set<string>;
};

export async function getPaluwagans(familyId: string, meId: string): Promise<PaluwaganView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("paluwagan_groups")
    .select("*, paluwagan_members(id, name, turn, is_us), paluwagan_payments(member_id, round)")
    .eq("family_id", familyId)
    .order("starts_on", { ascending: false });
  return (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    contribution: Number(g.contribution),
    frequency: g.frequency as PaluwaganFrequency,
    startsOn: g.starts_on,
    note: g.note,
    isPrivate: g.is_private,
    remind: g.remind,
    mine: g.recorded_by === meId,
    members: (g.paluwagan_members ?? []).map((m) => ({ id: m.id, name: m.name, turn: m.turn, isUs: m.is_us })).sort((a, b) => a.turn - b.turn),
    paid: new Set((g.paluwagan_payments ?? []).map((p) => `${p.member_id}:${p.round}`)),
  }));
}

export async function getPaluwagan(familyId: string, meId: string, id: string): Promise<PaluwaganView | null> {
  return (await getPaluwagans(familyId, meId)).find((g) => g.id === id) ?? null;
}
