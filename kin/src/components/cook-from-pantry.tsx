"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { addMealFromRecipeAction } from "@/lib/actions/household";

export type PantrySuggestion = { key: string | null; name: string; minutes: number | null; have: number; need: number; missing: string[] };

/** "Cook from what you have": recipes from the family's book the pantry
 * nearly covers, each one tap from tonight's dinner. Hidden when nothing
 * qualifies, so an empty pantry is not a nag. */
export function CookFromPantry({ date, suggestions }: { date: string; suggestions: PantrySuggestion[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (suggestions.length === 0) return null;

  const plan = (s: PantrySuggestion) =>
    start(async () => {
      const result = await addMealFromRecipeAction({ date, slot: "dinner", recipeKey: s.key, dish: s.name });
      setError(result.error);
      if (!result.error) {
        setAdded(s.name);
        router.refresh();
      }
    });

  return (
    <section className="kin-pantry" aria-label="Cook from what you have">
      <h4>
        <Icon name="bowlSteam" size={15} /> Cook from what you have
      </h4>
      <ul>
        {suggestions.map((s) => (
          <li key={s.key ?? s.name}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="kin-pantry-name">{s.name}</div>
              <div className="kin-pantry-meta">
                {s.missing.length === 0 ? "Everything's in the house" : `Have ${s.have} of ${s.need} · need ${s.missing.join(", ")}`}
                {s.minutes ? ` · ${s.minutes} min` : ""}
              </div>
            </div>
            <button type="button" className="btn btn-secondary" disabled={pending || added === s.name} onClick={() => plan(s)}>
              {added === s.name ? "Planned" : "For dinner"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="kin-pantry-error">{error}</p>}
    </section>
  );
}
