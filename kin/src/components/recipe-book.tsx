"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveRecipeAction,
  deleteRecipeAction,
  addMealIngredientsToBuyAction,
  toggleIngredientAtHomeAction,
  addRecipeCategoryAction,
  removeRecipeCategoryAction,
} from "@/lib/actions/household";
import type { CategoryView } from "@/lib/queries/recipes";
import { Icon, type IconName } from "@/components/icons";
import { Collapsible } from "@/components/sheet";
import { MARKET_SECTIONS, UNITS } from "@/lib/grocery";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, type MealSlot } from "@/lib/recipes";
import { plateAt, plateTone } from "@/lib/meal-photos";

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
  categories: string[];
  photoUrl: string | null;
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
export function RecipeBook({ recipes, categories: known }: { recipes: EditableRecipe[]; categories: CategoryView[] }) {
  const [editing, setEditing] = useState<EditableRecipe | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  if (creating || editing) {
    return (
      <RecipeEditor
        recipe={editing}
        known={known}
        onDone={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? recipes.filter((r) => r.name.toLowerCase().includes(q)) : null;

  // The categories that actually have something in them, each with a face:
  // one of the household's own photos from that category when they have
  // taken one, and the drawn plate until then.
  const categories = known
    .map((c) => {
      const items = recipes.filter((r) => r.categories.includes(c.key));
      return { ...c, items, photo: items.find((r) => r.photoUrl)?.photoUrl ?? null };
    })
    // A shipped category with nothing in it is noise; one the household made
    // stays whether or not anything has been filed under it yet, or it would
    // vanish the moment they created it.
    .filter((c) => c.own || c.items.length > 0);

  const chosen = category ? categories.find((c) => c.key === category) : null;

  // Filed the way meals are eaten, with the household's own first — that is
  // what anyone opening the book is looking for. A dish good for more than
  // one part of the day is filed under each, because the question being
  // asked is "what can we have for lunch", not "where does this belong".
  const own = recipes.filter((r) => r.origin !== "shipped");
  const groups = [
    ...(own.length > 0 ? [{ key: "own", title: "Yours", items: own }] : []),
    ...MEAL_SLOTS.map((s) => ({ key: s as string, title: MEAL_SLOT_LABEL[s], items: recipes.filter((r) => r.slots.includes(s)) })),
  ].filter((g) => g.items.length > 0);

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

      {/* Browse by what kind of food it is, the way a menu is read when
          nobody has decided yet. Tapping a tile narrows the book to it. */}
      {!matches && (
        <div className="cal-rail" style={{ gap: 10, margin: "0 -18px 14px", padding: "2px 18px 0" }}>
          <CategoryTile label="All" active={!category} onClick={() => setCategory(null)} count={recipes.length} />
          {categories.map((c) => (
            <CategoryTile
              key={c.key}
              label={c.label}
              icon={c.icon}
              tone={plateAt(c.plate)}
              photo={c.photo}
              count={c.items.length}
              active={category === c.key}
              onClick={() => setCategory(category === c.key ? null : c.key)}
            />
          ))}
          {/* The last tile makes a new one — a household files food its own
              way, and nine categories cannot know that. */}
          <NewCategoryTile onClick={() => setNaming(true)} />
        </div>
      )}

      {naming && <CategoryManager categories={known} onDone={() => setNaming(false)} />}

      {/* A search is already a short list; grouping it would only hide it.
          So is one category — the tile above says what you are looking at. */}
      {matches ? (
        matches.length > 0 ? (
          matches.map((r) => <RecipeRow key={r.id} recipe={r} onEdit={() => setEditing(r)} />)
        ) : (
          <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No recipe matches that.</p>
        )
      ) : chosen ? (
        chosen.items.map((r) => <RecipeRow key={r.id} recipe={r} onEdit={() => setEditing(r)} />)
      ) : (
        groups.map((g, i) => (
          // Only the first group is open: the book is a reference, not
          // something anyone reads from Adobo to Turon.
          <Collapsible key={g.key} title={g.title} meta={String(g.items.length)} defaultOpen={i === 0}>
            {g.items.map((r) => (
              <RecipeRow key={r.id} recipe={r} onEdit={() => setEditing(r)} />
            ))}
          </Collapsible>
        ))
      )}
    </div>
  );
}

/** The tile that adds one. Drawn as an empty plate so it reads as the next
 * one along rather than a button that wandered in. */
function NewCategoryTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "none",
        width: 72,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: "none",
        border: 0,
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      <span
        className="kin-tile"
        style={{ border: "1.5px dashed var(--color-neutral-400)", color: "var(--color-accent)", background: "transparent" }}
      >
        <Icon name="plus" size={22} />
      </span>
      <span style={{ fontSize: 11.5, lineHeight: 1.2, textAlign: "center", color: "var(--color-accent)" }}>New</span>
    </button>
  );
}

/** Name a new category, and take away one that turned out to be a mistake.
 * Only the household's own can go: the shipped ones are what every recipe is
 * already filed under. */
function CategoryManager({ categories, onDone }: { categories: CategoryView[]; onDone: () => void }) {
  const { pending, error, run } = useAct();
  const [label, setLabel] = useState("");
  const own = categories.filter((c) => c.own);

  const add = () => {
    if (!label.trim()) return;
    run(async () => {
      const result = await addRecipeCategoryAction(label);
      if (!result.error) setLabel("");
      return result;
    });
  };

  return (
    <div style={{ padding: 12, borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="input"
          placeholder="Another kind of food — Grilled, Baon, Handa…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Name for the new category"
          autoFocus
          style={{ flex: 1, minWidth: 0, minHeight: 40, fontSize: 14 }}
        />
        <button type="button" className="btn btn-secondary" style={{ minHeight: 40, fontSize: 13, padding: "0 12px" }} disabled={pending || !label.trim()} onClick={add}>
          Add
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40, fontSize: 12.5, padding: "0 8px" }} onClick={onDone}>
          Close
        </button>
      </div>

      {own.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {own.map((c) => (
            <span
              key={c.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12.5,
                padding: "4px 6px 4px 11px",
                borderRadius: 999,
                background: "color-mix(in srgb, var(--color-text) 7%, transparent)",
              }}
            >
              {c.label}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeRecipeCategoryAction(c.key))}
                aria-label={`Remove the ${c.label} category`}
                style={{ border: 0, background: "none", cursor: "pointer", padding: 2, display: "flex", color: "var(--color-neutral-600)" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--color-neutral-600)", margin: "10px 0 0", lineHeight: 1.45 }}>
        A new category is empty until you tick it on a recipe, under <strong>Kind of food</strong>.
      </p>
      {error && <div style={{ fontSize: 12.5, color: "var(--cal-occasion)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

/** One round tile in the category rail: the household's own photo of a dish
 * in that category, or the drawn plate until they have taken one. */
function CategoryTile({
  label,
  icon = "utensils",
  tone = plateAt(0),
  photo,
  count,
  active,
  onClick,
}: {
  label: string;
  icon?: IconName;
  tone?: { from: string; to: string; ink: string };
  photo?: string | null;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flex: "none",
        width: 72,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        background: "none",
        border: 0,
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      <span
        className="kin-tile"
        style={{
          background: photo ? undefined : `linear-gradient(140deg, ${tone.from}, ${tone.to})`,
          boxShadow: active ? "0 0 0 2.5px var(--color-accent)" : "0 0 0 1px var(--color-divider)",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" />
        ) : (
          <Icon name={icon} size={24} style={{ color: tone.ink, opacity: 0.9 }} />
        )}
      </span>
      <span
        style={{
          fontSize: 11.5,
          lineHeight: 1.2,
          textAlign: "center",
          color: active ? "var(--color-accent)" : "var(--color-text)",
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--color-neutral-600)", marginTop: -3 }}>{count}</span>
    </button>
  );
}

function RecipeRow({ recipe: r, onEdit }: { recipe: EditableRecipe; onEdit: () => void }) {
  const tone = plateTone(r.name);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--color-divider)" }}>
      <span
        className="kin-tile kin-tile--sm"
        style={{
          background: r.photoUrl ? undefined : `linear-gradient(140deg, ${tone.from}, ${tone.to})`,
          boxShadow: "0 0 0 1px var(--color-divider)",
        }}
      >
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.photoUrl} alt="" />
        ) : (
          <span style={{ font: "500 16px/1 var(--font-heading)", color: tone.ink, textTransform: "uppercase" }}>{r.name.trim().charAt(0)}</span>
        )}
      </span>
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
      <button type="button" className="btn btn-ghost" style={{ minHeight: 32, fontSize: 12.5, padding: "0 8px" }} onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

function RecipeEditor({ recipe, known, onDone }: { recipe: EditableRecipe | null; known: CategoryView[]; onDone: () => void }) {
  const { pending, error, run } = useAct();
  const [name, setName] = useState(recipe?.name ?? "");
  const [slots, setSlots] = useState<MealSlot[]>(recipe?.slots ?? ["dinner"]);
  const [categories, setCategories] = useState<string[]>(recipe?.categories ?? []);
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

      <div style={{ fontSize: 13, color: "var(--color-neutral-700)", marginBottom: 6 }}>Kind of food</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {known.map((c) => (
          <button
            key={c.key}
            type="button"
            className="chip"
            data-active={categories.includes(c.key)}
            onClick={() => setCategories((prev) => (prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key]))}
          >
            {c.label}
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
                categories,
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
