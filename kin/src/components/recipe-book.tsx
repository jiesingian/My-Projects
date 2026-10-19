"use client";

import { useId, useState, useTransition } from "react";
import { whoseRecipeLabel } from "@/lib/recipe-person";
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
import { ZoomableImage } from "@/components/zoomable-image";
import { readRecipeFromLinkAction } from "@/lib/actions/recipe-link";
import type { RecipeDraft } from "@/lib/recipe-import";
import { CookMode, ScaledIngredients, ServingsStepper } from "@/components/cook-mode";

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
  /** The page it was read from (Save a recipe from a link). */
  sourceUrl?: string | null;
  /** Whose recipe it is: somebody on the tree (20261019152700). */
  personId?: string | null;
};

/** Somebody on the household's tree a recipe can be named for. */
export type RecipePerson = { id: string; name: string };

/** "panlasangpinoy.com" from a recipe's link, for the line that credits it. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const ORIGIN_LABEL: Record<EditableRecipe["origin"], string> = {
  own: "Yours",
  edited: "Edited",
  shipped: "Kin",
};

/** The recipe book: every dish available to the household, each one editable.
 * Editing one Kin ships saves the household's version, which stands in for it
 * from then on — the shipped library is never mutated, so it stays
 * upgradeable. */
export function RecipeBook({
  recipes,
  categories: known,
  people = [],
  openId = null,
}: {
  recipes: EditableRecipe[];
  categories: CategoryView[];
  /** Everyone on the tree, for "Whose recipe". */
  people?: RecipePerson[];
  /** A recipe to open at, from a link on somebody's panel. */
  openId?: string | null;
}) {
  const [editing, setEditing] = useState<EditableRecipe | null>(null);
  const [creating, setCreating] = useState(false);
  // The recipe opened to read or cook from, by id so a refresh keeps it current.
  const [viewingId, setViewingId] = useState<string | null>(openId);
  const nameOf = (id: string | null | undefined) => (id ? (people.find((p) => p.id === id)?.name ?? null) : null);
  // Save a recipe from a link: the box is open, and what was read from it.
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  if (creating || editing) {
    return (
      <RecipeEditor
        recipe={editing}
        draft={editing ? null : draft}
        known={known}
        people={people}
        onDone={() => {
          setEditing(null);
          setCreating(false);
          setDraft(null);
        }}
      />
    );
  }

  const viewing = viewingId ? recipes.find((r) => r.id === viewingId) : null;
  if (viewing) {
    return (
      <RecipeDetail
        key={viewing.id}
        recipe={viewing}
        whose={whoseRecipeLabel(nameOf(viewing.personId))}
        onBack={() => setViewingId(null)}
        onEdit={() => {
          setViewingId(null);
          setEditing(viewing);
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
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.9375rem", marginBottom: "0.75rem" }} onClick={() => setCreating(true)}>
        <Icon name="plus" size={16} /> Write a new recipe
      </button>
      {linking ? (
        <FromLink
          onCancel={() => setLinking(false)}
          onRead={(d) => {
            setLinking(false);
            setDraft(d);
            setCreating(true);
          }}
        />
      ) : (
        <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.875rem", marginBottom: "0.75rem" }} onClick={() => setLinking(true)}>
          <Icon name="external" size={14} /> Save a recipe from a link
        </button>
      )}

      <input
        className="input"
        placeholder="Search recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ minHeight: "2.625rem", marginBottom: "0.75rem" }}
        aria-label="Search recipes"
      />

      {/* Browse by what kind of food it is, the way a menu is read when
          nobody has decided yet. Tapping a tile narrows the book to it. */}
      {!matches && (
        <div className="cal-rail" style={{ gap: "0.625rem", margin: "0 -18px 14px", padding: "0.125rem 1.125rem 0" }}>
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
          matches.map((r) => <RecipeRow key={r.id} recipe={r} onOpen={() => setViewingId(r.id)} onEdit={() => setEditing(r)} />)
        ) : (
          <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>No recipe matches that.</p>
        )
      ) : chosen ? (
        chosen.items.map((r) => <RecipeRow key={r.id} recipe={r} onOpen={() => setViewingId(r.id)} onEdit={() => setEditing(r)} />)
      ) : (
        groups.map((g) => (
          <Collapsible key={g.key} title={g.title} meta={String(g.items.length)}>
            {g.items.map((r) => (
              <RecipeRow key={r.id} recipe={r} onOpen={() => setViewingId(r.id)} onEdit={() => setEditing(r)} />
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
        gap: "0.3125rem",
        background: "none",
        border: 0,
        padding: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
      }}
    >
      <span
        className="kin-tile"
        style={{ border: "1.5px dashed var(--color-neutral-400)", color: "var(--color-accent-700)", background: "transparent" }}
      >
        <Icon name="plus" size={22} />
      </span>
      <span style={{ fontSize: "0.71875rem", lineHeight: 1.2, textAlign: "center", color: "var(--color-accent-700)" }}>New</span>
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
    <div style={{ padding: "0.75rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <input
          className="input"
          placeholder="Another kind of food — Grilled, Baon, Handa…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Name for the new category"
          autoFocus
          style={{ flex: 1, minWidth: 0, minHeight: "2.5rem", fontSize: "0.875rem" }}
        />
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.8125rem", padding: "0 0.75rem" }} disabled={pending || !label.trim()} onClick={add}>
          Add
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.5rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={onDone}>
          Close
        </button>
      </div>

      {own.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.625rem" }}>
          {own.map((c) => (
            <span
              key={c.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.78125rem",
                padding: "0.25rem 0.375rem 0.25rem 0.6875rem",
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
                style={{ border: 0, background: "none", cursor: "pointer", padding: "0.125rem", display: "flex", color: "var(--color-neutral-600)" }}
              >
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "10px 0 0", lineHeight: 1.45 }}>
        A new category is empty until you tick it on a recipe, under <strong>Kind of food</strong>.
      </p>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
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
        gap: "0.3125rem",
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
          <img src={photo} alt={label} />
        ) : (
          <Icon name={icon} size={24} style={{ color: tone.ink, opacity: 0.9 }} />
        )}
      </span>
      <span
        style={{
          fontSize: "0.71875rem",
          lineHeight: 1.2,
          textAlign: "center",
          color: active ? "var(--color-accent)" : "var(--color-text)",
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: "0.65625rem", color: "var(--color-neutral-600)", marginTop: -3 }}>{count}</span>
    </button>
  );
}

function RecipeRow({ recipe: r, onOpen, onEdit }: { recipe: EditableRecipe; onOpen: () => void; onEdit: () => void }) {
  const tone = plateTone(r.name);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5625rem 0", borderBottom: "1px solid var(--color-divider)" }}>
      <span
        className="kin-tile kin-tile--sm"
        style={{
          background: r.photoUrl ? undefined : `linear-gradient(140deg, ${tone.from}, ${tone.to})`,
          boxShadow: "0 0 0 1px var(--color-divider)",
        }}
      >
        {r.photoUrl ? (
          <ZoomableImage src={r.photoUrl} alt={r.name} />
        ) : (
          <span style={{ font: "500 1rem/1 var(--font-heading)", color: tone.ink, textTransform: "uppercase" }}>{r.name.trim().charAt(0)}</span>
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The name opens the recipe to read, scale and cook from. */}
        <button
          type="button"
          onClick={onOpen}
          style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "none", padding: 0, color: "inherit", font: "inherit", cursor: "pointer" }}
        >
          <span style={{ display: "block", fontSize: "0.9375rem", fontWeight: 500 }}>{r.name}</span>
          <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
            {r.ingredients.length} ingredients · {r.slots.map((s) => MEAL_SLOT_LABEL[s]).join(", ")}
            {r.minutes ? ` · ${r.minutes} min` : ""}
          </span>
        </button>
        {r.sourceUrl && (
          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)" }}>
            From {hostOf(r.sourceUrl)} ↗
          </a>
        )}
      </div>
      <span
        style={{
          flex: "none",
          fontSize: "0.65625rem",
          padding: "0.125rem 0.4375rem",
          borderRadius: 999,
          background: r.origin === "shipped" ? "color-mix(in srgb, var(--color-text) 8%, transparent)" : "color-mix(in srgb, var(--cal-home) 16%, transparent)",
          color: "var(--color-neutral-700)",
        }}
      >
        {ORIGIN_LABEL[r.origin]}
      </span>
      <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}

/** One recipe to read and cook from: the ingredients at however many people
 * are eating, the steps, and the way into cook mode. The servings stepper is
 * a view; the recipe keeps its own `serves` until someone edits it. */
function RecipeDetail({ recipe: r, whose, onBack, onEdit }: { recipe: EditableRecipe; whose: string; onBack: () => void; onEdit: () => void }) {
  const serves = r.serves > 0 ? r.serves : 4;
  const [servings, setServings] = useState(serves);
  const [cooking, setCooking] = useState(false);
  const steps = r.steps.map((s) => s.trim()).filter(Boolean);
  const scaled = servings !== serves;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.5rem", gap: "0.25rem" }} onClick={onBack}>
          <Icon name="chevronLeft" size={14} /> Back
        </button>
        <span style={{ flex: 1, minWidth: 0, font: "600 0.9375rem/1.2 var(--font-heading)" }}>{r.name}</span>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.5rem" }} onClick={onEdit}>
          Edit
        </button>
      </div>

      {whose && <p style={{ font: "500 0.875rem/1.3 var(--font-heading)", color: "var(--color-accent-700)", margin: "0 0 0.375rem" }}>{whose}</p>}
      {r.minutes ? <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>About {r.minutes} min</p> : null}

      {steps.length > 0 && (
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: "3rem", fontSize: "1rem", marginBottom: "1rem", gap: "0.375rem" }} onClick={() => setCooking(true)}>
          <Icon name="utensils" size={17} /> Cook
        </button>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
        <span style={{ font: "600 0.9375rem/1.2 var(--font-heading)" }}>Ingredients</span>
        <ServingsStepper servings={servings} onChange={setServings} />
      </div>
      {scaled && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0" }}>
          Scaled from {serves}. The recipe itself is unchanged.{" "}
          <button type="button" onClick={() => setServings(serves)} style={{ border: 0, background: "none", padding: 0, color: "var(--color-accent-700)", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>
            Back to {serves}
          </button>
        </p>
      )}
      {r.ingredients.length > 0 ? (
        <ScaledIngredients ingredients={r.ingredients} serves={serves} servings={servings} />
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>No ingredients written down yet.</p>
      )}

      <div style={{ font: "600 0.9375rem/1.2 var(--font-heading)", margin: "1.25rem 0 0.5rem" }}>How to cook it</div>
      {steps.length > 0 ? (
        <ol style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.9375rem", lineHeight: 1.5 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: "0.5rem" }}>
              {s}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>No steps written down yet. Edit the recipe to add them, one per line.</p>
      )}

      {r.sourceUrl && (
        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "inline-block", marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--color-accent-700)" }}>
          From {hostOf(r.sourceUrl)} ↗
        </a>
      )}

      {cooking && (
        <CookMode name={r.name} steps={steps} ingredients={r.ingredients} serves={serves} servings={servings} onServings={setServings} onClose={() => setCooking(false)} />
      )}
    </div>
  );
}

function RecipeEditor({
  recipe,
  draft,
  known,
  people,
  onDone,
}: {
  recipe: EditableRecipe | null;
  draft?: RecipeDraft | null;
  known: CategoryView[];
  people: RecipePerson[];
  onDone: () => void;
}) {
  const uid = useId();
  const { pending, error, run } = useAct();
  // A new recipe read from a link starts from what the page said.
  const start = recipe ?? (draft ? { ...draft, serves: draft.serves ?? 4 } : null);
  const [name, setName] = useState(start?.name ?? "");
  const [slots, setSlots] = useState<MealSlot[]>(recipe?.slots ?? ["dinner"]);
  const [categories, setCategories] = useState<string[]>(recipe?.categories ?? []);
  const [serves, setServes] = useState(String(start?.serves ?? 4));
  const [minutes, setMinutes] = useState(start?.minutes == null ? "" : String(start.minutes));
  const [steps, setSteps] = useState((start?.steps ?? []).join("\n"));
  const [ingredients, setIngredients] = useState<{ name: string; qty: string; unit: string; section: string }[]>(() => {
    const rows = (start?.ingredients ?? []).map((i) => ({ name: i.name, qty: i.qty == null ? "" : String(i.qty), unit: i.unit ?? "pc", section: i.section }));
    return rows.length > 0 ? rows : [{ name: "", qty: "", unit: "pc", section: "Other" }];
  });
  const sourceUrl = recipe ? (recipe.sourceUrl ?? null) : (draft?.sourceUrl ?? null);
  // A name kept for someone since taken off the tree reads as nobody's.
  const [personId, setPersonId] = useState(recipe?.personId && people.some((p) => p.id === recipe.personId) ? recipe.personId : "");

  const setIng = (idx: number, patch: Partial<(typeof ingredients)[number]>) =>
    setIngredients((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.5rem", gap: "0.25rem" }} onClick={onDone}>
          <Icon name="chevronLeft" size={14} /> Back
        </button>
        <span style={{ flex: 1, font: "600 0.9375rem/1.2 var(--font-heading)" }}>{recipe ? recipe.name : "New recipe"}</span>
      </div>

      {draft && !recipe && (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)", margin: "0 0 12px", lineHeight: 1.45 }}>
          {draft.found
            ? <>Read from <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{hostOf(draft.sourceUrl)}</a>. Check the amounts and steps, then save.</>
            : <>That page had no recipe Kin could read, only its title. Write the ingredients and steps in; the link is kept with it.</>}
        </p>
      )}

      {recipe?.origin === "shipped" && (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)", margin: "0 0 12px", lineHeight: 1.45 }}>
          Saving keeps your version of this dish. Kin&rsquo;s original stays as it is, and yours is used from now on.
        </p>
      )}

      <div className="field" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={`${uid}-name`}>Name</label>
        <input id={`${uid}-name`} aria-label="Name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken adobo" maxLength={150} style={{ minHeight: "2.75rem" }} />
      </div>

      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Usually eaten at</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.75rem" }}>
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

      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Kind of food</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.75rem" }}>
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

      <div style={{ display: "flex", gap: "0.625rem", marginBottom: "0.75rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-serves`}>Serves</label>
          <input id={`${uid}-serves`} aria-label="Serves" className="input" type="number" min="1" max="30" value={serves} onChange={(e) => setServes(e.target.value)} style={{ minHeight: "2.75rem" }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-minutes`}>Minutes</label>
          <input id={`${uid}-minutes`} aria-label="Minutes" className="input" type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ minHeight: "2.75rem" }} />
        </div>
      </div>

      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Ingredients</div>
      {ingredients.map((ing, idx) => (
        <div key={idx} style={{ display: "flex", gap: "0.3125rem", marginBottom: "0.375rem", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Ingredient"
            value={ing.name}
            onChange={(e) => setIng(idx, { name: e.target.value })}
            maxLength={150}
            style={{ minHeight: "2.5rem", flex: 1.6, fontSize: "0.875rem" }}
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
            style={{ minHeight: "2.5rem", width: "4.125rem", fontSize: "0.875rem" }}
            aria-label="Quantity"
          />
          <select
            className="input"
            value={ing.unit}
            onChange={(e) => setIng(idx, { unit: e.target.value })}
            style={{ minHeight: "2.5rem", width: "4.875rem", fontSize: "0.8125rem" }}
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
            style={{ border: 0, background: "none", cursor: "pointer", padding: "0.3125rem", display: "flex", color: "var(--color-neutral-600)" }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: "2.375rem", fontSize: "0.8125rem", padding: "0 0.75rem", marginBottom: "0.875rem" }}
        onClick={() => setIngredients((prev) => [...prev, { name: "", qty: "", unit: "pc", section: "Other" }])}
      >
        <Icon name="plus" size={13} /> Add ingredient
      </button>

      {people.length > 0 && (
        <div className="field" style={{ marginBottom: "0.875rem" }}>
          <label htmlFor={`${uid}-whose`}>Whose recipe</label>
          <select id={`${uid}-whose`} className="input" value={personId} onChange={(e) => setPersonId(e.target.value)} style={{ minHeight: "2.75rem" }}>
            <option value="">Nobody in particular</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0" }}>
            Lola&rsquo;s adobo: it shows with them on the tree, even if they have passed.
          </p>
        </div>
      )}

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor={`${uid}-steps`}>How to cook it — one step per line</label>
        <textarea id={`${uid}-steps`} aria-label="How To Cook It — One Step Per Line" className="input" value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={8000} rows={5} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.875rem", fontSize: "0.9375rem" }}
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
                // Only a new recipe from a link sets it; an edit leaves it.
                sourceUrl: !recipe && sourceUrl ? sourceUrl : undefined,
                treePersonId: people.length > 0 ? personId || null : undefined,
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
            style={{ minHeight: "2.875rem", fontSize: "0.8125rem", padding: "0 0.75rem", color: "var(--cal-occasion)" }}
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
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  );
}

/** Put a meal's outstanding ingredients on the shopping list. */
export function AddIngredientsToBuyButton({ mealId, missing }: { mealId: string; missing: number }) {
  const { pending, error, run } = useAct();
  const [added, setAdded] = useState<number | null>(null);

  if (missing === 0) return null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
      <button
        type="button"
        className="btn btn-secondary"
        style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem", gap: "0.25rem" }}
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
      {added != null && <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)" }}>{added} added</span>}
      {error && <span style={{ fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</span>}
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
        gap: "0.1875rem",
        fontSize: "0.71875rem",
        padding: "0.1875rem 0.5625rem",
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

/** Paste a recipe's address; Kin reads it on the server (readRecipeFromLinkAction)
 * and opens the editor filled in. Nothing is saved until Save there. */
function FromLink({ onRead, onCancel }: { onRead: (draft: RecipeDraft) => void; onCancel: () => void }) {
  const uid = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const read = () =>
    startTransition(async () => {
      setError(null);
      const r = await readRecipeFromLinkAction(url);
      if (r.error || !r.draft) setError(r.error ?? "Kin couldn't read that page.");
      else onRead(r.draft);
    });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        read();
      }}
      style={{ marginBottom: "0.75rem" }}
    >
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-url`}>Recipe link</label>
        <input id={`${uid}-url`} className="input" type="url" inputMode="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.panlasangpinoy.com/…" style={{ minHeight: "2.75rem" }} />
      </div>
      {error && (
        <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-danger)", margin: "0 0 0.5rem" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem" }} disabled={pending || !url.trim()}>
          {pending ? "Reading…" : "Read the recipe"}
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.625rem" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
