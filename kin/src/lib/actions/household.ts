"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, removeRowFromCalendars } from "@/lib/actions/calendar-sync";
import { MARKET_SECTIONS, guessSection, parseQuantity } from "@/lib/grocery";
import { normalizeKey } from "@/lib/pricebook";
import { MEAL_SLOTS, RECIPE_CATEGORIES, RECIPES_BY_KEY, type MealSlot } from "@/lib/recipes";
import { RECIPE_PHOTO_BUCKET } from "@/lib/meal-photos";
import type { ActionState } from "@/lib/actions/auth";
import type { TablesInsert } from "@/lib/database.types";

export async function addBuyItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const sectionRaw = String(formData.get("section") ?? "").trim();
  const source = String(formData.get("source") ?? "house");
  if (!name) return { error: "Name the item." };

  // An empty section means the member didn't pick one — file it themselves.
  const section = (MARKET_SECTIONS as readonly string[]).includes(sectionRaw) ? sectionRaw : guessSection(name);

  const { error } = await supabase.from("buy_items").insert({
    family_id: me.family_id,
    name,
    quantity: quantityRaw ? Number(quantityRaw) : null,
    unit,
    section,
    source,
    created_by: me.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function updateBuyItemAction(
  itemId: string,
  input: { name: string; quantity: number | null; unit: string | null; section: string },
): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (!input.name.trim()) return { error: "Name the item." };

  const { error } = await supabase
    .from("buy_items")
    .update({
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit,
      section: (MARKET_SECTIONS as readonly string[]).includes(input.section) ? input.section : "Other",
    })
    .eq("id", itemId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { error: null };
}

export async function removeBuyItemAction(itemId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("buy_items").delete().eq("id", itemId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function toggleBuyItemAction(itemId: string, checked: boolean) {
  const supabase = await createClient();
  await supabase
    .from("buy_items")
    .update({ checked, checked_at: checked ? new Date().toISOString() : null })
    .eq("id", itemId);
  revalidatePath("/household");
}

export async function clearCheckedAction(familyId: string) {
  const supabase = await createClient();
  await supabase
    .from("buy_items")
    .update({ cleared: true, cleared_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("checked", true)
    .eq("cleared", false);
  revalidatePath("/household");
}

export async function addMealPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const date = String(formData.get("date") ?? "");
  const dish = String(formData.get("dish") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const slotRaw = String(formData.get("slot") ?? "dinner");
  const slot = MEAL_SLOTS.includes(slotRaw as MealSlot) ? slotRaw : "dinner";
  const ingredients = String(formData.get("ingredients") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!date || !dish) return { error: "Date and dish are required." };

  const { data: plan, error } = await supabase
    .from("meal_plans")
    .insert({ family_id: me.family_id, plan_date: date, slot, dish, note, created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (ingredients.length > 0) {
    await supabase.from("meal_ingredients").insert(
      ingredients.map((ingredient_name) => ({
        meal_plan_id: plan.id,
        family_id: me.family_id,
        ingredient_name,
        item_key: normalizeKey(ingredient_name),
      })),
    );
  }

  await syncRowToCalendars(me.family_id, "meal_plans", plan.id, { title: dish, startAt: new Date(`${date}T00:00:00`), allDay: true }, { kind: "all" });

  revalidatePath("/household");
  redirect("/household?seg=meals");
}

/** `weekOf` is any day in the week to build from — the week the meal plan is
 * showing, which is not always this one. */
export async function generateGroceryListAction(familyId: string, createdBy: string, weekOf?: string) {
  const supabase = await createClient();
  const day = weekOf ? new Date(`${weekOf}T00:00:00`) : new Date();
  // The Monday on or before that day — a Sunday belongs to the week it ends,
  // and used to be dropped from its own list.
  const startOfWeek = new Date(day);
  startOfWeek.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  // Local dates, not toISOString: that shifts to UTC and, east of Greenwich,
  // names the day before.
  const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [{ data: meals }, { data: openBuy }] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("meal_ingredients(ingredient_name, qty, qty_amount, unit, section, item_key)")
      .eq("family_id", familyId)
      .gte("plan_date", isoOf(startOfWeek))
      .lt("plan_date", isoOf(endOfWeek)),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false),
  ]);

  // What is already in the house does not need buying — the whole reason the
  // pantry exists.
  const { data: pantry } = await supabase.from("pantry_items").select("item_key").eq("family_id", familyId);
  const atHome = new Set((pantry ?? []).map((p) => p.item_key));
  const existing = new Set((openBuy ?? []).map((b) => normalizeKey(b.name)));
  const seen = new Set<string>();
  const toInsert: TablesInsert<"buy_items">[] = [];

  for (const meal of meals ?? []) {
    for (const ing of meal.meal_ingredients ?? []) {
      const key = ing.item_key ?? normalizeKey(ing.ingredient_name);
      if (existing.has(key) || seen.has(key) || atHome.has(key)) continue;
      seen.add(key);
      const parsed = parseQuantity(ing.qty);
      const quantity = ing.qty_amount == null ? parsed.quantity : Number(ing.qty_amount);
      const unit = ing.unit ?? parsed.unit;
      toInsert.push({
        family_id: familyId,
        name: ing.ingredient_name,
        quantity,
        unit,
        // Filed by name so a generated list already reads in market order.
        section: ing.section ?? guessSection(ing.ingredient_name),
        source: "meal_plan",
        created_by: createdBy,
      });
    }
  }

  if (toInsert.length > 0) {
    await supabase.from("buy_items").insert(toInsert);
  }

  revalidatePath("/household");
  return toInsert.length;
}

// ————————————————————————————————————————————————————————————————
// Price book, pantry, and meals that know their slot and their recipe
// ————————————————————————————————————————————————————————————————

/** Set what an item really costs here. The family's figure replaces the
 * shipped estimate from then on, everywhere it is used. */
export async function setItemPriceAction(input: {
  name: string;
  unitPrice: number;
  unit: string;
  section: string;
  note?: string | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!input.name.trim()) return { error: "Name the item." };
  if (!(input.unitPrice >= 0)) return { error: "A price cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase.from("price_list").upsert(
    {
      family_id: me.family_id,
      item_key: normalizeKey(input.name),
      name: input.name.trim(),
      unit: input.unit,
      unit_price: input.unitPrice,
      section: input.section,
      note: input.note ?? null,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "family_id,item_key" },
  );
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { error: null };
}

/** Drop the family's own price, so the shipped estimate applies again. */
export async function resetItemPriceAction(itemKey: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("price_list").delete().eq("family_id", me.family_id).eq("item_key", itemKey);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

/** A price for this one line only — the shop had it cheaper today, without
 * that becoming the household's standing price. */
export async function setBuyItemPriceAction(itemId: string, unitPrice: number | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("buy_items")
    .update({ unit_price_override: unitPrice })
    .eq("id", itemId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function setPantryItemAction(input: { name: string; quantity?: number | null; unit?: string | null }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!input.name.trim()) return { error: "Name the item." };

  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").upsert(
    {
      family_id: me.family_id,
      item_key: normalizeKey(input.name),
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      updated_by: me.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "family_id,item_key" },
  );
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function removePantryItemAction(itemKey: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("pantry_items").delete().eq("family_id", me.family_id).eq("item_key", itemKey);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

/** Add a meal from the recipe library, or from scratch. Choosing a recipe
 * brings its ingredients with it, which is the point: planning the week and
 * writing the shopping list stop being two separate jobs. */
export async function addMealFromRecipeAction(input: {
  date: string;
  slot: string;
  recipeKey?: string | null;
  dish?: string | null;
  note?: string | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const recipe = input.recipeKey ? RECIPES_BY_KEY.get(input.recipeKey) : undefined;
  const dish = (recipe?.name ?? input.dish ?? "").trim();
  if (!input.date || !dish) return { error: "Pick a day and a dish." };
  if (!MEAL_SLOTS.includes(input.slot as MealSlot)) return { error: "Pick which part of the day it is for." };

  // Sits after whatever is already in that slot.
  const { count } = await supabase
    .from("meal_plans")
    .select("id", { count: "exact", head: true })
    .eq("family_id", me.family_id)
    .eq("plan_date", input.date)
    .eq("slot", input.slot);

  const { data: plan, error } = await supabase
    .from("meal_plans")
    .insert({
      family_id: me.family_id,
      plan_date: input.date,
      slot: input.slot,
      position: count ?? 0,
      dish,
      note: input.note ?? null,
      recipe_key: recipe?.key ?? null,
      created_by: me.id,
    })
    .select()
    .single();
  if (error || !plan) return { error: error?.message ?? "Could not save the meal." };

  if (recipe) {
    await supabase.from("meal_ingredients").insert(
      recipe.ingredients.map((ing) => ({
        meal_plan_id: plan.id,
        family_id: me.family_id,
        ingredient_name: ing.name,
        item_key: normalizeKey(ing.name),
        qty_amount: ing.qty,
        unit: ing.unit,
        section: ing.section,
        qty: `${ing.qty} ${ing.unit}`,
      })),
    );
  }

  await syncRowToCalendars(
    me.family_id,
    "meal_plans",
    plan.id,
    { title: dish, startAt: new Date(`${input.date}T00:00:00`), allDay: true },
    { kind: "all" },
  );

  revalidatePath("/household");
  revalidatePath("/planner");
  return { error: null };
}

export async function removeMealAction(mealId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await removeRowFromCalendars(me.family_id, "meal_plans", mealId);
  const { error } = await supabase.from("meal_plans").delete().eq("id", mealId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  revalidatePath("/planner");
  return { error: null };
}

// ————————————————————————————————————————————————————————————————
// The household's own recipe book
// ————————————————————————————————————————————————————————————————

type RecipeIngredientInput = { name: string; qty: number | null; unit: string | null; section: string };

async function saveRecipeIngredients(recipeId: string, familyId: string, ingredients: RecipeIngredientInput[]) {
  const supabase = await createClient();
  await supabase.from("family_recipe_ingredients").delete().eq("recipe_id", recipeId);
  const rows = ingredients
    .filter((ing) => ing.name.trim())
    .map((ing, position) => ({
      recipe_id: recipeId,
      family_id: familyId,
      name: ing.name.trim(),
      item_key: normalizeKey(ing.name),
      qty: ing.qty,
      unit: ing.unit,
      section: ing.section,
      position,
    }));
  if (rows.length > 0) await supabase.from("family_recipe_ingredients").insert(rows);
}

/** Save a recipe into the household's book. Passing `baseKey` records it as
 * their version of one Kin ships, which then stands in for it everywhere —
 * the shipped library stays untouched and upgradeable. */
export async function saveRecipeAction(input: {
  id?: string | null;
  baseKey?: string | null;
  name: string;
  slots: string[];
  categories?: string[];
  serves: number;
  minutes: number | null;
  steps: string[];
  ingredients: RecipeIngredientInput[];
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const name = input.name.trim();
  if (!name) return { error: "Give the recipe a name." };
  const slots = input.slots.filter((s) => MEAL_SLOTS.includes(s as MealSlot));
  if (slots.length === 0) return { error: "Say when it is usually eaten." };
  if (input.ingredients.filter((i) => i.name.trim()).length === 0) return { error: "A recipe needs at least one ingredient." };

  const supabase = await createClient();
  const row = {
    family_id: me.family_id,
    name,
    base_key: input.baseKey ?? null,
    slots,
    // Unstated is not the same as none: an empty list lets the book guess
    // from the name and ingredients rather than filing it nowhere.
    categories: (input.categories ?? []).filter((c) => (RECIPE_CATEGORIES as string[]).includes(c)),
    serves: Math.min(30, Math.max(1, Math.round(input.serves || 4))),
    minutes: input.minutes,
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    updated_at: new Date().toISOString(),
  };

  let recipeId = input.id ?? null;
  if (recipeId) {
    const { error } = await supabase.from("family_recipes").update(row).eq("id", recipeId).eq("family_id", me.family_id);
    if (error) return { error: error.message };
  } else {
    // Editing a shipped recipe twice should update the same row, not make a
    // second one claiming the same base.
    const { data, error } = await supabase
      .from("family_recipes")
      .upsert({ ...row, created_by: me.id }, { onConflict: "family_id,base_key" })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Could not save the recipe." };
    recipeId = data.id;
  }

  await saveRecipeIngredients(recipeId, me.family_id, input.ingredients);
  revalidatePath("/household");
  return { error: null };
}

export async function deleteRecipeAction(recipeId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("family_recipes").delete().eq("id", recipeId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

/** Put one meal's ingredients on the shopping list — everything not already
 * in the house and not already on it. */
export async function addMealIngredientsToBuyAction(mealId: string): Promise<ActionState & { added?: number }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: meal } = await supabase
    .from("meal_plans")
    .select("id, dish, meal_ingredients(ingredient_name, item_key, qty, qty_amount, unit, section)")
    .eq("id", mealId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!meal) return { error: "That meal is no longer here." };

  const [{ data: openBuy }, { data: pantry }] = await Promise.all([
    supabase.from("buy_items").select("name").eq("family_id", me.family_id).eq("cleared", false),
    supabase.from("pantry_items").select("item_key").eq("family_id", me.family_id),
  ]);

  const already = new Set((openBuy ?? []).map((b) => normalizeKey(b.name)));
  const atHome = new Set((pantry ?? []).map((p) => p.item_key));

  const rows: TablesInsert<"buy_items">[] = [];
  for (const ing of meal.meal_ingredients ?? []) {
    const key = ing.item_key ?? normalizeKey(ing.ingredient_name);
    if (already.has(key) || atHome.has(key)) continue;
    already.add(key);
    const parsed = parseQuantity(ing.qty);
    rows.push({
      family_id: me.family_id,
      name: ing.ingredient_name,
      quantity: ing.qty_amount == null ? parsed.quantity : Number(ing.qty_amount),
      unit: ing.unit ?? parsed.unit,
      section: ing.section ?? guessSection(ing.ingredient_name),
      source: "meal_plan",
      created_by: me.id,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("buy_items").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/household");
  return { error: null, added: rows.length };
}

/** Change how much of one ingredient this particular meal needs. It is the
 * meal's own amount, not the recipe's: doubling the adobo for a Sunday lunch
 * shouldn't rewrite the recipe for every other week. The free-text `qty` is
 * rewritten to match so the shopping list, which reads either, agrees. */
export async function setMealIngredientAction(input: {
  ingredientId: string;
  amount: number | null;
  unit: string | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const amount = input.amount == null || Number.isNaN(input.amount) ? null : input.amount;
  if (amount != null && (amount < 0 || amount > 100000)) return { error: "That amount doesn't look right." };
  const unit = input.unit?.trim() ? input.unit.trim().slice(0, 24) : null;

  const { error } = await supabase
    .from("meal_ingredients")
    .update({
      qty_amount: amount,
      unit,
      qty: amount == null ? (unit ?? null) : `${amount}${unit ? ` ${unit}` : ""}`,
    })
    .eq("id", input.ingredientId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { error: null };
}

/** Take one ingredient off a meal entirely. */
export async function removeMealIngredientAction(ingredientId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("meal_ingredients").delete().eq("id", ingredientId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

/** Add an ingredient a recipe never listed — the garlic this house always
 * puts in, the extra rice for a crowd. */
export async function addMealIngredientAction(input: { mealId: string; name: string; amount?: number | null; unit?: string | null }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { error: "Give the ingredient a name." };

  const amount = input.amount == null || Number.isNaN(input.amount) ? null : input.amount;
  const unit = input.unit?.trim() ? input.unit.trim().slice(0, 24) : null;

  const { error } = await supabase.from("meal_ingredients").insert({
    meal_plan_id: input.mealId,
    family_id: me.family_id,
    ingredient_name: name,
    item_key: normalizeKey(name),
    section: guessSection(name),
    qty_amount: amount,
    unit,
    qty: amount == null ? unit : `${amount}${unit ? ` ${unit}` : ""}`,
  });
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { error: null };
}

/** Attach the household's own photo to a dish. Keyed by the dish rather than
 * by the evening, so it shows every time that dish is cooked. */
export async function setRecipePhotoAction(recipeRef: string, storagePath: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (!recipeRef || !storagePath) return { error: "That photo didn't arrive." };
  // Uploads land under the family's own folder; refuse anything else outright
  // rather than trusting the path a browser handed back.
  if (!storagePath.startsWith(`${me.family_id}/`)) return { error: "That photo didn't arrive." };

  const { data: old } = await supabase
    .from("recipe_photos")
    .select("storage_path")
    .eq("family_id", me.family_id)
    .eq("recipe_ref", recipeRef)
    .maybeSingle();

  const { error } = await supabase
    .from("recipe_photos")
    .upsert(
      { family_id: me.family_id, recipe_ref: recipeRef, storage_path: storagePath, created_by: me.id },
      { onConflict: "family_id,recipe_ref" },
    );
  if (error) return { error: error.message };

  // The one it replaced is nobody's now.
  if (old?.storage_path && old.storage_path !== storagePath) {
    await supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([old.storage_path]);
  }

  revalidatePath("/household");
  return { error: null };
}

export async function removeRecipePhotoAction(recipeRef: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("recipe_photos")
    .select("storage_path")
    .eq("family_id", me.family_id)
    .eq("recipe_ref", recipeRef)
    .maybeSingle();

  const { error } = await supabase.from("recipe_photos").delete().eq("family_id", me.family_id).eq("recipe_ref", recipeRef);
  if (error) return { error: error.message };
  if (photo?.storage_path) await supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([photo.storage_path]);

  revalidatePath("/household");
  return { error: null };
}

/** Mark one ingredient as already in the house, or take it back off. */
export async function toggleIngredientAtHomeAction(name: string, atHome: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const key = normalizeKey(name);

  if (atHome) {
    const { error } = await supabase
      .from("pantry_items")
      .upsert({ family_id: me.family_id, item_key: key, name: name.trim(), updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: "family_id,item_key" });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("pantry_items").delete().eq("family_id", me.family_id).eq("item_key", key);
    if (error) return { error: error.message };
  }

  revalidatePath("/household");
  return { error: null };
}
