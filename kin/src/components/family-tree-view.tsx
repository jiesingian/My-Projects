import { Avatar } from "@/components/avatar";
import { Blueprint } from "@/components/ui";
import { initials } from "@/lib/format";
import type { FamilyTree, TreePerson } from "@/lib/queries/family";

function PersonCard({ person, highlight }: { person: TreePerson; highlight?: boolean }) {
  const year = person.dob ? person.dob.slice(0, 4) : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 9px 5px 5px",
        borderRadius: 20,
        background: highlight ? "var(--color-accent-100)" : "transparent",
        border: highlight ? "1px solid var(--color-accent-700)" : "1px solid transparent",
        maxWidth: 168,
      }}
    >
      <Avatar url={person.avatarUrl} initials={initials(person.fullName)} size={28} />
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            font: "600 12.5px/1.2 var(--font-heading)",
            display: "block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {person.fullName}
        </span>
        {year && <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>b. {year}</span>}
      </span>
    </div>
  );
}

function GenerationBand({ people, centerId }: { people: TreePerson[]; centerId?: string | null }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
      {people.map((p) => (
        <PersonCard key={p.id} person={p} highlight={p.id === centerId} />
      ))}
    </div>
  );
}

function groupByDepth(entries: { person: TreePerson; depth: number }[]): Map<number, TreePerson[]> {
  const map = new Map<number, TreePerson[]>();
  for (const { person, depth } of entries) {
    if (!map.has(depth)) map.set(depth, []);
    map.get(depth)!.push(person);
  }
  return map;
}

function Half({ people, empty }: { people: TreePerson[]; empty?: string }) {
  if (people.length === 0) {
    return empty ? <div style={{ fontSize: 12, color: "var(--color-neutral-500)", textAlign: "center", padding: "10px 0" }}>{empty}</div> : <div />;
  }
  return <GenerationBand people={people} />;
}

/** The visual tree itself: a pedigree chart, ancestors above descendants.
 * Each generation is one row split into father's-side and mother's-side
 * halves -- the immediate father and mother sit in the row directly above
 * the centre, their own parents in the row above that, and so on upward.
 * Purely a display of what getFamilyTree already resolved -- FamilyTreeEditor
 * is where the links get set.
 *
 * Until 14 September this drew father's side and mother's side as two full
 * height columns either side of the centre instead, each stacking its own
 * generations top to bottom. That put an ancestor beside the centre rather
 * than above it, which read as confusing precisely because it wasn't the
 * pedigree shape the labels implied. */
export function FamilyTreeView({ tree }: { tree: FamilyTree }) {
  const fatherByDepth = groupByDepth(tree.fatherSide);
  const motherByDepth = groupByDepth(tree.motherSide);

  // Depth 1 -- the immediate father and mother -- always gets a row, even
  // with nobody recorded yet: that row is the invitation to add them, same
  // as the old side columns never disappeared when empty. Deeper rows only
  // appear once there's actually someone at that generation, on either side.
  const depths = new Set<number>([1, ...fatherByDepth.keys(), ...motherByDepth.keys()]);
  const orderedDepths = [...depths].sort((a, b) => b - a);

  return (
    <div className="kin-treestack">
      <Blueprint style={{ padding: "14px 10px" }}>
        <div className="kin-treegenlabels">
          <span>FATHER&apos;S SIDE</span>
          <span>MOTHER&apos;S SIDE</span>
        </div>
        {orderedDepths.map((depth, i) => (
          <div key={depth}>
            {i > 0 && <div className="kin-treeconnector" />}
            <div className="kin-treegen">
              <Half people={fatherByDepth.get(depth) ?? []} empty={depth === 1 ? "Not recorded yet" : undefined} />
              <Half people={motherByDepth.get(depth) ?? []} empty={depth === 1 ? "Not recorded yet" : undefined} />
            </div>
          </div>
        ))}
      </Blueprint>
      <div className="kin-treeconnector" />
      <Blueprint className="bg-[var(--color-accent-100)]" style={{ padding: "14px 10px" }}>
        <GenerationBand people={tree.core} centerId={tree.centerId} />
        {tree.children.length > 0 && (
          <>
            <div className="kin-treeconnector" />
            <div
              style={{
                font: "600 10px/1 var(--font-heading)",
                letterSpacing: ".06em",
                color: "var(--color-neutral-600)",
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              CHILDREN
            </div>
            <GenerationBand people={tree.children} />
          </>
        )}
      </Blueprint>
    </div>
  );
}
