"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import { humanDatabaseError } from "@/lib/db-errors";
import { getFamilyTree } from "@/lib/queries/family";
import { getTreeMatches, type BranchPerson } from "@/lib/queries/tree-links";
import { matchBranch, mergeBranch, type ChartPerson } from "@/lib/tree-merge";
import { buildGedcom, gedcomFileName, IMPORT_MAX, type ExportPerson, type ImportPlan } from "@/lib/gedcom";
import { familyDay, familyMidnight } from "@/lib/time";

/* A tree file in and out (19 October). Kin Plus, grown-ups. Every row is
   read and written with the member's own client, so row-level security keeps
   this to their own household's tree and the linked branches it may already
   read; the checks below are words for the screen and limits on size. */

const PLUS_ONLY = "Importing and exporting a tree file is part of Kin Plus.";
const GROWN_UPS = "Only a grown-up in the household can import or export the tree.";

/** The tree, and each linked household's branch the household has an
 * accepted match with, drawn once (matchBranch/mergeBranch, as the chart
 * does), as a GEDCOM file. A linked household's people come as a name and a
 * birth year -- all the shared-branch read gives -- and so does anybody of
 * ours who may be alive (lib/gedcom.ts). */
export async function exportGedcomAction(): Promise<{ error: string | null; file?: string; name?: string }> {
  const me = await requireCurrentMember();
  if (!readAccess(me.families).plus) return { error: PLUS_ONLY };
  if (!isGrownUp(me.role)) return { error: GROWN_UPS };
  const supabase = await createClient();
  const [tree, matches] = await Promise.all([getFamilyTree(me.family_id, me.id), getTreeMatches(me.family_id)]);

  const ours = new Map(tree.people.map((p) => [p.id, p]));
  let chart: ChartPerson[] = tree.people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    birthYear: p.dob?.slice(0, 4) ?? null,
    avatarUrl: null,
    memberId: p.memberId,
    fatherId: p.fatherId,
    motherId: p.motherId,
    spouseId: p.spouseId,
    fromHousehold: null,
  }));
  for (const m of matches.filter((x) => x.status === "accepted" && ours.has(x.ourPersonId))) {
    const { data } = await supabase.rpc("shared_branch", { match: m.matchId });
    const branch: BranchPerson[] = (data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      birthYear: p.birth_year,
      fatherId: p.father_id,
      motherId: p.mother_id,
      spouseId: p.spouse_id,
      isSharedPerson: p.is_shared_person,
    }));
    if (!branch.length) continue;
    chart = mergeBranch(chart, branch, m.matchId, m.ourPersonId, m.otherFamilyName, matchBranch(chart, branch, m.ourPersonId));
  }

  const people: ExportPerson[] = chart.map((c) => {
    const p = ours.get(c.id);
    return {
      id: c.id,
      fullName: c.fullName,
      sex: p?.sex === "male" ? "M" : p?.sex === "female" ? "F" : null,
      dob: p?.dob ?? null,
      birthYear: c.birthYear,
      notes: p?.notes ?? null,
      fatherId: c.fatherId,
      motherId: c.motherId,
      spouseId: c.spouseId,
    };
  });
  if (!people.length) return { error: "The tree is empty. Add someone to it first." };
  const today = familyDay(new Date(), me.families.time_zone);
  return { error: null, file: buildGedcom(people, { household: me.families.name, today }), name: gedcomFileName(me.families.name) };
}

const NAME_MAX = 100;
const NOTES_MAX = 500;
const clean = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);

/** Adds the people a grown-up confirmed from a tree file, and links them --
 * to each other and to people already on the tree. Nothing already recorded
 * is overwritten: a person of ours only gains a father, mother or spouse
 * they had none of, checked again here at the moment of writing. */
export async function importGedcomAction(plan: ImportPlan): Promise<{ error: string | null; added?: number; linked?: number }> {
  const me = await requireCurrentMember();
  if (!readAccess(me.families).plus) return { error: PLUS_ONLY };
  if (!isGrownUp(me.role)) return { error: GROWN_UPS };
  if (!plan.add.length && !plan.fill.length) return { error: "Nothing was chosen to add." };
  if (plan.add.length > IMPORT_MAX) return { error: `A file can add up to ${IMPORT_MAX} people at a time.` };

  const supabase = await createClient();
  // Every person of ours the plan names must be on this household's tree.
  const ourIds = [...new Set([...Object.values(plan.existing), ...plan.fill.map((f) => f.personId)])];
  if (ourIds.length) {
    const { data } = await supabase.from("family_tree_people").select("id").eq("family_id", me.family_id).in("id", ourIds);
    if ((data ?? []).length !== ourIds.length) return { error: "The tree changed while you were looking. Open the file again." };
  }

  const idOf = new Map<string, string>(Object.entries(plan.existing));
  for (const a of plan.add) if (!idOf.has(a.ref)) idOf.set(a.ref, randomUUID());
  const ref = (r: string | null) => (r ? (idOf.get(r) ?? null) : null);
  const today = familyDay(new Date(), me.families.time_zone);
  const validDay = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && familyMidnight(d) && d <= today ? d : null);

  if (plan.add.length) {
    // One statement, so a person may name a parent added in the same file:
    // the foreign keys are checked at its end.
    const rows = plan.add.map((a) => {
      const id = idOf.get(a.ref)!;
      const link = (r: string | null) => {
        const to = ref(r);
        return to && to !== id ? to : null;
      };
      return {
        id,
        family_id: me.family_id,
        full_name: clean(a.fullName, NAME_MAX) || "Unnamed",
        dob: validDay(a.dob),
        notes: clean(a.notes, NOTES_MAX) || null,
        father_id: link(a.fatherRef),
        mother_id: link(a.motherRef),
        spouse_id: link(a.spouseRef),
        created_by: me.id,
      };
    });
    const { error } = await supabase.from("family_tree_people").insert(rows);
    if (error) return { error: humanDatabaseError(error.message) };
  }

  let linked = 0;
  for (const f of plan.fill) {
    for (const [column, r] of [["father_id", f.fatherRef], ["mother_id", f.motherRef], ["spouse_id", f.spouseRef]] as const) {
      const to = ref(r);
      if (!to || to === f.personId) continue;
      const { data, error } = await supabase.from("family_tree_people").update(column === "father_id" ? { father_id: to } : column === "mother_id" ? { mother_id: to } : { spouse_id: to }).eq("id", f.personId).eq("family_id", me.family_id).is(column, null).select("id");
      if (error) return { error: humanDatabaseError(error.message), added: plan.add.length, linked };
      linked += data?.length ?? 0;
    }
  }
  revalidatePath("/family");
  return { error: null, added: plan.add.length, linked };
}
