"use client";

import type { WhoseOption } from "@/lib/wealth";

/** "Whose is it?" on every add-income and add-expense form (Janine, 23
 * October): You first, then each household member, then Family (joint).
 * Uncontrolled with `name` inside a form action; controlled with `value`
 * where the form keeps its own state. */
export function WhoseSelect({ options, name, value, onChange }: { options: WhoseOption[]; name?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <select
      className="input"
      name={name}
      {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: "me" })}
      style={{ minHeight: "2.625rem" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
