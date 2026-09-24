"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

/** Whose meals to show. A dropdown rather than a row of chips because a
 * household can have six people and this sits above five meal slots -- a
 * rail of names here would push the day's food off the screen. */
export function MealWhoPicker({
  members,
  who,
  date,
}: {
  members: { id: string; name: string }[];
  who: string;
  date: string;
}) {
  const router = useRouter();
  const uid = useId();

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
      <label htmlFor={`${uid}-who`} style={{ fontSize: "0.71875rem", letterSpacing: ".05em", color: "var(--color-neutral-500)" }}>Showing</label>
      <select
        id={`${uid}-who`}
        className="input"
        value={who}
        onChange={(e) => router.push(`/household?seg=meals&date=${date}&who=${e.target.value}`)}
        style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.5rem", width: "auto" }}
      >
        <option value="all">Everyone</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name.split(" ")[0]}
          </option>
        ))}
      </select>
    </span>
  );
}
