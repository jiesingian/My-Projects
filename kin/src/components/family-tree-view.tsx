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

function groupByDepth(entries: { person: TreePerson; depth: number }[]): [number, TreePerson[]][] {
  const map = new Map<number, TreePerson[]>();
  for (const { person, depth } of entries) {
    if (!map.has(depth)) map.set(depth, []);
    map.get(depth)!.push(person);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

function SideColumn({ label, entries }: { label: string; entries: { person: TreePerson; depth: number }[] }) {
  const groups = groupByDepth(entries);
  return (
    <Blueprint style={{ padding: "14px 10px", minHeight: 120 }}>
      <div
        style={{
          font: "600 11px/1 var(--font-heading)",
          letterSpacing: ".06em",
          color: "var(--color-neutral-600)",
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-500)", textAlign: "center", padding: "14px 0" }}>Nobody recorded yet</div>
      ) : (
        groups.map(([depth, people], i) => (
          <div key={depth}>
            {i > 0 && <div className="kin-treeconnector" />}
            <GenerationBand people={people} />
          </div>
        ))
      )}
    </Blueprint>
  );
}

/** The visual tree itself: father's side and mother's side as two columns,
 * the centre's own generation and children between them. Purely a display
 * of what getFamilyTree already resolved -- FamilyTreeEditor is where the
 * links get set. */
export function FamilyTreeView({ tree }: { tree: FamilyTree }) {
  return (
    <div className="kin-treecols">
      <SideColumn label="FATHER'S SIDE" entries={tree.fatherSide} />
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
      <SideColumn label="MOTHER'S SIDE" entries={tree.motherSide} />
    </div>
  );
}
