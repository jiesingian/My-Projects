import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import { keepKidViewOut } from "@/lib/kid-view";
import { DetailHeader } from "@/components/hub-header";
import { PlusNote } from "@/components/plus";
import { getFamilyTree } from "@/lib/queries/family";
import { TreeFile } from "./tree-file";

/** Import or export a tree file (GEDCOM), 19 October: Kin Plus, grown-ups.
 * Export is the household's tree and what it can see of linked households'
 * branches; import reads a file a relative made on MyHeritage, FamilySearch
 * or Ancestry, says who is already on the tree, and writes nothing until a
 * grown-up confirms (lib/gedcom.ts, lib/actions/gedcom.ts). */
export default async function TreeFilePage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const plus = readAccess(me.families).plus;
  const grownUp = isGrownUp(me.role);
  const tree = plus && grownUp ? await getFamilyTree(me.family_id, me.id) : null;
  const byId = new Map((tree?.people ?? []).map((p) => [p.id, p]));
  const ours = (tree?.people ?? []).map((p) => ({
    id: p.id,
    fullName: p.fullName,
    dob: p.dob,
    fatherName: p.fatherId ? (byId.get(p.fatherId)?.fullName ?? null) : null,
    motherName: p.motherId ? (byId.get(p.motherId)?.fullName ?? null) : null,
    fatherId: p.fatherId,
    motherId: p.motherId,
    spouseId: p.spouseId,
  }));

  return (
    <div>
      <DetailHeader backHref="/family?seg=tree" eyebrow="Family tree" />
      <div style={{ padding: "0 var(--gutter) 1.5rem" }}>
        <h3 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>Tree file</h3>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 0.875rem" }}>
          Bring in a tree a relative made on MyHeritage, FamilySearch or Ancestry, or take yours there. The file is a GEDCOM (.ged), the one every family tree site reads.
        </p>
        {!plus ? (
          <PlusNote area="Importing and exporting a tree file" detail="The family tree stays free. Bringing in or taking out a whole tree file needs Plus." />
        ) : !grownUp ? (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)" }}>Ask a grown-up in the household to import or export the tree.</p>
        ) : (
          <TreeFile ours={ours} />
        )}
      </div>
    </div>
  );
}
