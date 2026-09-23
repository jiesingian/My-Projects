"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMealFromRecipeAction, removeMealAction } from "@/lib/actions/household";
import { Icon } from "@/components/icons";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, RECIPES, type MealSlot } from "@/lib/recipes";

function useMealAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };
  return { pending, error, run };
}

/** Plan a meal. The library is the fast path — pick a dish and its
 * ingredients come with it — with a free-text fallback for anything the
 * library has never heard of. */
export function AddMealControl({ date, slot }: { date: string; slot: MealSlot }) {
  const { pending, error, run } = useMealAction();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const forSlot = RECIPES.filter((r) => r.slots.includes(slot));
    const rest = RECIPES.filter((r) => !r.slots.includes(slot));
    // Dishes usually eaten at this time first, then everything else — a
    // household can have champorado for dinner, it is just less likely.
    const ordered = [...forSlot, ...rest];
    return q ? ordered.filter((r) => r.name.toLowerCase().includes(q)) : ordered;
  }, [query, slot]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost"
        style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.5rem", gap: "0.25rem", color: "var(--color-accent)" }}
      >
        <Icon name="plus" size={14} />
        Add {MEAL_SLOT_LABEL[slot].toLowerCase()}
      </button>
    );
  }

  return (
    <div style={{ padding: "0.75rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginTop: "0.375rem" }}>
      <input
        className="input"
        placeholder="Search dishes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ minHeight: "2.625rem", marginBottom: "0.5rem" }}
        autoFocus
        aria-label="Search the recipe library"
      />

      <div style={{ maxHeight: "13.75rem", overflowY: "auto", marginBottom: "0.625rem" }}>
        {suggestions.slice(0, 40).map((r) => (
          <button
            key={r.key}
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await addMealFromRecipeAction({ date, slot, recipeKey: r.key });
                if (!result.error) setOpen(false);
                return result;
              })
            }
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5625rem 0.375rem",
              border: 0,
              borderRadius: 10,
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "var(--font-body)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.9375rem", fontWeight: 500 }}>{r.name}</span>
              <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                {r.ingredients.length} ingredients · {r.minutes} min · serves {r.serves}
              </span>
            </span>
            <Icon name="plus" size={15} style={{ color: "var(--color-accent)", flex: "none" }} />
          </button>
        ))}
        {suggestions.length === 0 && (
          <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", padding: "0.5rem 0.375rem", margin: 0 }}>
            Nothing in the library matches. Type it in below and it will be added as its own dish.
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.375rem", borderTop: "1px solid var(--color-divider)", paddingTop: "0.625rem" }}>
        <input
          className="input"
          placeholder="Or type a dish"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          maxLength={150}
          style={{ minHeight: "2.5rem", flex: 1, fontSize: "0.875rem" }}
          aria-label="A dish not in the library"
        />
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.5rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
          disabled={pending || !custom.trim()}
          onClick={() =>
            run(async () => {
              const result = await addMealFromRecipeAction({ date, slot, dish: custom });
              if (!result.error) {
                setCustom("");
                setOpen(false);
              }
              return result;
            })
          }
        >
          Add
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.5rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </div>
  );
}

/** `onPhoto` puts it on the dish's picture, where a grey glyph would
 * disappear into whatever was photographed. */
export function RemoveMealButton({ mealId, onPhoto = false }: { mealId: string; onPhoto?: boolean }) {
  const { pending, run } = useMealAction();
  return (
    <button
      type="button"
      onClick={() => run(() => removeMealAction(mealId))}
      disabled={pending}
      aria-label="Remove this meal"
      className={onPhoto ? "kin-plate-action" : undefined}
      style={
        onPhoto
          ? { padding: "0 0.5rem" }
          : { border: 0, background: "none", cursor: "pointer", padding: "0.3125rem", display: "flex", color: "var(--color-neutral-600)", flex: "none" }
      }
    >
      <Icon name="x" size={14} />
    </button>
  );
}

export { MEAL_SLOTS, MEAL_SLOT_LABEL };
