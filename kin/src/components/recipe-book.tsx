"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveRecipeAction,
  deleteRecipeAction,
  addMealIngredientsToBuyAction,
  toggleIngredientAtHomeAction,
} from "@/lib/actions/household";
import { Icon } from "@/components/icons";
import { MARKET_SECTIONS, UNITS } from "@/lib/grocery";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealSlot } from "@/lib/recipes";

function useAct() {
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

export type EditableRecipe = {
  id: string;
  key: string | null;
  familyRecipeId: string | null;
  name: string;
  slots: MealSlot[];
  serves: number;
  minutes: number | null;
  steps: string[];
  ingredients: { name: string; qty: number | null; unit: string | null; section: string }[];
  origin: "own" | "edited" | "shipped";
};

const ORIGIN_LABEL: Record<EditableRecipe["origin"], string> = {
  own: "Yours",
  edited: "Edited",
  shipped: "Kin",
};

/** The recipe book: every dish available to the household, each one editable.
 * Editing one Kin ships saves the household's version, which stands in for it
 * from then on — the shipped library is never mutated, so it stays
 * upgradeable. */
export function RecipeBook({ recipes }: { recipes: EditableRecipe[] }) {
  const [editing, setEditing] = useState<EditableRecipe | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  if (creating || editing) {
    return (
      <RecipeEditor
        recipe={editing}
        onDone={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  const shown = query.trim() ? recipes.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : recipes;

  return (
    <div>
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 15, marginBottom: 12 }} onClick={() => setCreating(true)}>
        <Icon name="plus" size={16} /> Write a new recipe
      </button>

      <input
        className="input"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ minHeight: 42, marginBottom: 12 }}
        aria-label="Search recipes"
      />

      {shown.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
              {r.ingredients.length} ingredients · {r.slots.map((s) => MEAL_SLOT_LABEL[s]).join(", ")}
              {r.minutes ? ` · ${r.minutes} min` : ""}
            </div>
          </div>
          <span
            style={{
              flex: "none",
              fontSize: 10.5,
              padding: "2px 7px",
              borderRadius: 999,
              background: r.origin === "shipped" ? "color-mix(in srgb, var(--color-text) 8%, transparent)" : "color-mix(in srgb, var(--cal-home) 16%, transparent)",
              color: "var(--color-neutral-700)",
            }}
          >
            {ORIGIN_LABEL[r.origin]}
          </span>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px" }} onClick={() => setEditing(r)}>
            Edit
          </button>
        </div>
      ))}

      {shown.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No recipe matches that.</p>}
    </div>
  );
}

function RecipeEditor({ recipe, onDone }: { recipe: EditableRecipe | null; onDone: () => void }) {
  const { pending, error, run } = useAct();
  const [name, setName] = useState(recipe?.name ?? "");
  const [slots, setSlots] = useState<MealSlot[]>(recipe?.slots ?? ["dinner"]);
  const [serves, setServes] = useState(String(recipe?.serves ?? 4));
  const [minutes, setMinutes] = useState(recipe?.minutes == null ? "" : String(recipe.minutes));
  const [steps, setSteps] = useState((recipe?.steps ?? []).join("\n"));
  const [ingredients, setIngredients] = useState<{ name: string; qty: string; unit: string; section: string }[]>(
    recipe?.ingredients.map((i) => ({ name: i.name, qty: i.qty == null ? "" : String(i.qty), unit: i.unit ?? "pc", section: i.section })) ?? [
      { name: "", qty: "", unit: "pc", section: "Other" },
    ],
  );

  const setIng = (idx: number, patch: Partial<(typeof ingredients)[number]>) =>
    setIngredients((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 34, fontSize: 13, padding: "0 8px", gap: 4 }} onClick={onDone}>
          <Icon name="chevronLeft" size={14} /> Back
        </button>
        <span style={{ flex: 1, font: "600 15px/1.2 var(--font-heading)" }}>{recipe ? recipe.name : "New recipe"}</span>
      </div>

      {recipe?.origin === "shipped" && (
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-700)", margin: "0 0 12px", lineHeight: 1.45 }}>
          Saving keeps your version of this dish. Kin&rsquo;s original stays as it is, and yours is used from now on.
        </p>
      )}

      <div className="field" style={{ marginBottom: 12 }}>
        <label>NAME</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken adobo" style={{ minHeight: 44 }} />
      </div>

      <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Usually eaten at</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {MEAL_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            data-active={slots.includes(s)}
            onClick={() => setSlots((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))}
          >
            {MEAL_SLOT_LABEL[s]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>SERVES</label>
          <input className="input" type="number" min="1" max="30" value={serves} onChange={(e) => setServes(e.target.value)} style={{ minHeight: 44 }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>MINUTES</label>
          <input className="input" type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ minHeight: 44 }} />
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Ingredients</div>
      {ingredients.map((ing, idx) => (
        <div key={idx} style={{ display: "flex", gap: 5, marginBottom: 6, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Ingredient"
            value={ing.name}
            onChange={(e) => setIng(idx, { name: e.target.value })}
            style={{ minHeight: 40, flex: 1.6, fontSize: 14 }}
            aria-label={`Ingredient ${idx + 1}`}
          />
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Qty"
            value={ing.qty}
            onChange={(e) => setIng(idx, { qty: e.target.value })}
            style={{ minHeight: 40, width: 66, fontSize: 14 }}
            aria-label="Quantity"
          />
          <select
            className="input"
            value={ing.unit}
            onChange={(e) => setIng(idx, { unit: e.target.value })}
            style={{ minHeight: 40, width: 78, fontSize: 13 }}
            aria-label="Unit"
          >
            {[...new Set([ing.unit, ...UNITS])].map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
            aria-label="Remove this ingredient"
            style={{ border: 0, background: "none", cursor: "pointer", padding: 5, display: "flex", color: "var(--color-neutral-600)" }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: 38, fontSize: 13, padding: "0 12px", marginBottom: 14 }}
        onClick={() => setIngredients((prev) => [...prev, { name: "", qty: "", unit: "pc", section: "Other" }])}
      >
        <Icon name="plus" size={13} /> Add ingredient
      </button>

      <div className="field" style={{ marginBottom: 14 }}>
        <label>HOW TO COOK IT — ONE STEP PER LINE</label>
        <textarea className="input" value={steps} onChange={(e) => setSteps(e.target.value)} rows={5} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: 46, fontSize: 15 }}
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await saveRecipeAction({
                id: recipe?.familyRecipeId ?? null,
                baseKey: recipe?.origin === "shipped" ? recipe.key : (recipe?.key ?? null),
                name,
                slots,
                serves: Number(serves) || 4,
                minutes: minutes === "" ? null : Number(minutes),
                steps: steps.split("\n"),
                ingredients: ingredients.map((i) => ({
                  name: i.name,
                  qty: i.qty === "" ? null : Number(i.qty),
                  unit: i.unit,
                  section: (MARKET_SECTIONS as readonly string[]).includes(i.section) ? i.section : "Other",
                })),
              });
              if (!result.error) onDone();
              return result;
            })
          }
        >
          Save recipe
        </button>
        {recipe?.familyRecipeId && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 46, fontSize: 13, padding: "0 12px", color: "var(--cal-occasion)" }}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await deleteRecipeAction(recipe.familyRecipeId!);
                if (!result.error) onDone();
                return result;
              })
            }
          >
            {recipe.origin === "edited" ? "Revert to Kin's" : "Delete"}
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/** Put a meal's outstanding ingredients on the shopping list. */
export function AddIngredientsToBuyButton({ mealId, missing }: { mealId: string; missing: number }) {
  const { pending, error, run } = useAct();
  const [added, setAdded] = useState<number | null>(null);

  if (missing === 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: 30, fontSize: 12.5, padding: "0 10px", gap: 4 }}
        disabled={pending}
        onClick={() =>
          run(async () => {
            const result = await addMealIngredientsToBuyAction(mealId);
            if (!result.error) setAdded(result.added ?? 0);
            return result;
          })
        }
      >
        <Icon name="basket" size={13} />
        Add {missing} to list
      </button>
      {added != null && <span style={{ fontSize: 12, color: "var(--color-neutral-700)" }}>{added} added</span>}
      {error && <span style={{ fontSize: 12, color: "var(--cal-occasion)" }}>{error}</span>}
    </span>
  );
}

/** One ingredient chip. Tapping it says the house already has it, which
 * takes it off every shopping list built from here on. */
export function IngredientChip({ name, inPantry, onList }: { name: string; inPantry: boolean; onList: boolean }) {
  const { pending, run } = useAct();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => toggleIngredientAtHomeAction(name, !inPantry))}
      title={inPantry ? "In the house — tap to say it is not" : onList ? "On the shopping list — tap if it is already in the house" : "Tap if it is already in the house"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11.5,
        padding: "3px 9px",
        borderRadius: 999,
        border: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        background: inPantry
          ? "color-mix(in srgb, var(--color-switch-on) 18%, transparent)"
          : onList
            ? "color-mix(in srgb, var(--cal-schedule) 14%, transparent)"
            : "color-mix(in srgb, var(--color-text) 6%, transparent)",
        color: "var(--color-text)",
      }}
    >
      {inPantry && <Icon name="check" size={10} style={{ color: "var(--color-switch-on)" }} />}
      {name}
    </button>
  );
}
