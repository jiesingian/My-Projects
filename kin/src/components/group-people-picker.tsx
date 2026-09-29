"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { initials } from "@/lib/format";

export type PickablePerson = { personId: string; fullName: string; avatarUrl: string | null; householdName: string | null };

/** A tick list of people: your connections and your family. Controlled, so
 * the create form and the members page share it. */
export function GroupPeoplePicker({ people, chosen, onChange }: { people: PickablePerson[]; chosen: string[]; onChange: (ids: string[]) => void }) {
  const [filter, setFilter] = useState("");
  const shown = people.filter((p) => !filter || p.fullName.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  if (people.length === 0) {
    return (
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
        Nobody to add yet. Connect with people under Family → Connections, or link with another household.
      </p>
    );
  }
  return (
    <div>
      {people.length > 8 && (
        <input className="input" placeholder="Find someone" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem" }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{chosen.length} chosen</span>
        <button type="button" className="btn btn-ghost" onClick={() => onChange(chosen.length === people.length ? [] : people.map((p) => p.personId))}>
          {chosen.length === people.length ? "Clear" : "Everyone"}
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((p) => (
          <li key={p.personId}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", minHeight: "3rem", padding: "0.375rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
              <input type="checkbox" checked={chosen.includes(p.personId)} onChange={() => toggle(p.personId)} style={{ width: "1.25rem", height: "1.25rem" }} />
              <Avatar url={p.avatarUrl} initials={initials(p.fullName)} label={p.fullName} size={36} clickable={false} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600 }}>{p.fullName}</span>
                {p.householdName && <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{p.householdName}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
