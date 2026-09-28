"use client";

import type { Tables } from "@/lib/database.types";

/** The ★ on an entry: marking it a milestone, and whose. Milestones were a
 * list of their own until 29 September; now they are entries with the mark,
 * so a first step can have its photo and its story like any other day. */
export function MilestoneField({
  on,
  memberId,
  members,
  onChange,
}: {
  on: boolean;
  memberId: string | null;
  members: Tables<"members">[];
  onChange: (next: { on: boolean; memberId: string | null }) => void;
}) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <button
        type="button"
        className="kin-star-toggle"
        aria-pressed={on}
        data-active={on || undefined}
        onClick={() => onChange({ on: !on, memberId })}
      >
        <span aria-hidden="true">{on ? "★" : "☆"}</span> {on ? "A milestone" : "Mark as a milestone"}
      </button>
      {on && (
        <>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0.625rem 0 0.375rem" }}>Whose milestone</div>
          <div role="radiogroup" aria-label="Whose milestone" style={{ display: "flex", gap: "0.4375rem", flexWrap: "wrap" }}>
            <button type="button" role="radio" aria-checked={memberId === null} className="chip" data-active={memberId === null} onClick={() => onChange({ on, memberId: null })}>
              The family
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={memberId === m.id}
                className="chip"
                data-active={memberId === m.id}
                onClick={() => onChange({ on, memberId: m.id })}
              >
                {m.full_name.split(" ")[0]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
