"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { setMealMembersAction } from "@/lib/actions/household";

/** Who this dish is for. Nobody selected means the whole household, which is
 * both the common case and the one that keeps the shopping list honest: one
 * dish is one set of ingredients however many people eat it. */
export function MealWhoEditor({
  mealPlanId,
  members,
  selected,
}: {
  mealPlanId: string;
  members: { id: string; name: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>(selected);

  const save = (next: string[]) => {
    setChosen(next);
    setError(null);
    startTransition(async () => {
      const result = await setMealMembersAction(mealPlanId, next);
      if (result.error) {
        setError(result.error);
        setChosen(selected);
      }
      router.refresh();
    });
  };

  const label =
    chosen.length === 0
      ? "Everyone"
      : members
          .filter((m) => chosen.includes(m.id))
          .map((m) => m.name.split(" ")[0])
          .join(", ") || "Everyone";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: "0.3125rem" }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpen((v) => !v)}
        style={{ minHeight: "1.5rem", fontSize: "0.75rem", padding: "0 0.375rem", gap: "0.25rem", color: "var(--color-neutral-700)" }}
      >
        <Icon name="users" size={12} />
        {label}
      </button>

      <span className="kin-reveal" data-open={open ? "true" : undefined}>
        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.3125rem", paddingTop: "0.0625rem" }}>
          <button
            type="button"
            className={chosen.length === 0 ? "btn btn-primary" : "btn btn-secondary"}
            disabled={pending}
            onClick={() => save([])}
            style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.5rem" }}
          >
            Everyone
          </button>
          {members.map((m) => {
            const on = chosen.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={on ? "btn btn-primary" : "btn btn-secondary"}
                disabled={pending}
                onClick={() => save(on ? chosen.filter((id) => id !== m.id) : [...chosen, m.id])}
                style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.5rem" }}
              >
                {m.name.split(" ")[0]}
              </button>
            );
          })}
        </span>
      </span>
      {error && <span style={{ fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</span>}
    </span>
  );
}
