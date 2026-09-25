"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";

/** Whose documents and passwords the vault shows -- the same kind of control
 * as Wealth's, and for the same reason: a row of chips stops scaling once a
 * household has five or six people. */
export function VaultWhosePicker({ members, who, tab }: { members: { id: string; name: string }[]; who: string; tab: "documents" | "passwords" }) {
  const router = useRouter();
  const uid = useId();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <label htmlFor={`${uid}-who`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
        Whose
      </label>
      <select
        id={`${uid}-who`}
        className="input"
        value={who}
        onChange={(e) => router.push(`/family?seg=documents&tab=${tab}&who=${e.target.value}`)}
        style={{ minHeight: "2.375rem", fontSize: "0.875rem", padding: "0 0.625rem", width: "auto" }}
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
