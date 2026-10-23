import { createClient } from "@/lib/supabase/server";
import { mealCost, type MealCost } from "@/lib/meal-cost";
import { loadFamilyPrices } from "@/lib/queries/household-money";
import { normalizeKey } from "@/lib/pricebook";
import { sectionOrder } from "@/lib/grocery";
import { getSignedUrls } from "@/lib/storage";
import { recipeRef, RECIPE_PHOTO_BUCKET } from "@/lib/meal-photos";
import { RECIPES_BY_KEY, type MealSlot } from "@/lib/recipes";
import { toISODate } from "@/lib/routines";
import { type LiquidIntakeType, type LiquidIntakeMember } from "@/lib/liquid-intake";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { nextEventDate } from "@/lib/grocery";
import type { LoyaltyCard } from "@/lib/loyalty-cards";
import { readTripLines } from "@/lib/buy-budget";

/** The open list, grouped by market section and ordered the way the sections
 * are walked, so it can be shopped straight down. */
export async function getBuyItems(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buy_items")
    .select("*")
    .eq("family_id", familyId)
    .eq("cleared", false)
    // A list built from the week's meals is inserted in one statement, so
    // fifteen rows share a created_at to the microsecond. Ordering on that
    // alone leaves ties, and Postgres is free to return tied rows in any
    // order — which reshuffled the list on every save. Name breaks the tie,
    // and id breaks a repeated name.
    .order("created_at")
    .order("name")
    .order("id");
  const items = data ?? [];

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const list = groups.get(item.section) ?? [];
    list.push(item);
    groups.set(item.section, list);
  }

  return {
    items,
    groups: Array.from(groups.entries())
      .sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]))
      .map(([name, groupItems]) => ({
        name,
        items: groupItems,
        openCount: groupItems.filter((i) => !i.checked).length,
      })),
    openCount: items.filter((i) => !i.checked).length,
    doneCount: items.filter((i) => i.checked).length,
  };
}

/** The events a line on the list can be for: everything still ahead -- a
 * yearly one at its next turn -- soonest first, plus any already chosen by a
 * line on the list, so a line keeps its event's name after the day passes. */
export async function getBuyListEvents(familyId: string): Promise<{ id: string; title: string; date: string }[]> {
  const supabase = await createClient();
  const [tz, { data: events }, { data: linked }] = await Promise.all([
    householdZone(),
    supabase.from("events").select("id, title, event_date, end_date, recurs_yearly").eq("family_id", familyId),
    supabase.from("buy_items").select("event_id").eq("family_id", familyId).eq("cleared", false).not("event_id", "is", null),
  ]);
  const today = familyDay(new Date(), tz);
  const chosen = new Set((linked ?? []).map((l) => l.event_id));
  return (events ?? [])
    .map((e) => ({ id: e.id, title: e.title, date: nextEventDate(e, today) }))
    .filter((e) => e.date >= today || chosen.has(e.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export type PlannedIngredient = {
  id: string;
  name: string;
  /** What the recipe said, as free text — kept for anything an amount and a
   * unit can't hold ("to taste", "a handful"). */
  qty: string | null;
  amount: number | null;
  unit: string | null;
  key: string;
  inPantry: boolean;
  onList: boolean;
};

export type PlannedMeal = {
  id: string;
  dish: string;
  slot: MealSlot;
  planDate: string;
  note: string | null;
  recipeKey: string | null;
  familyRecipeId: string | null;
  /** The dish's own name for its photo — see recipeRef. */
  ref: string;
  photoUrl: string | null;
  minutes: number | null;
  serves: number | null;
  steps: string[];
  ingredients: PlannedIngredient[];
  missing: number;
  have: number;
  ingredientCount: number;
  /** Empty means the whole household, which is the common case and the
   * reason it is expressed by an absence of rows rather than by tagging
   * everybody. */
  memberIds: string[];
  /** What the whole meal costs from the price book (lib/meal-cost). */
  cost: MealCost;
};

/** Everything cooked on one day, with the amounts each meal needs and the
 * household's photo of each dish. One day is all the meal plan shows, so one
 * day is all this loads. */
export async function getMealsForDay(familyId: string, anchor: Date = new Date()) {
  const supabase = await createClient();
  const anchorISO = toISODate(anchor);

  const [{ data: dayRows }, { data: activeBuy }, { data: pantry }, { data: photos }, familyPrices] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("*, meal_ingredients(*), family_recipes(minutes, serves, steps), meal_plan_members(member_id)")
      .eq("family_id", familyId)
      .eq("plan_date", anchorISO)
      .order("position"),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false).eq("checked", false),
    supabase.from("pantry_items").select("item_key").eq("family_id", familyId),
    supabase.from("recipe_photos").select("recipe_ref, storage_path").eq("family_id", familyId),
    loadFamilyPrices(familyId),
  ]);
  const priceMap = new Map([...familyPrices].map(([k, v]) => [k, { unit_price: Number(v.unit_price), unit: v.unit }]));

  const atHome = new Set((pantry ?? []).map((p) => p.item_key));
  const openNames = new Set((activeBuy ?? []).map((b) => normalizeKey(b.name)));

  const photoOf = new Map((photos ?? []).map((p) => [p.recipe_ref, p.storage_path]));
  const rows = dayRows ?? [];
  const wanted = Array.from(new Set(rows.map((m) => photoOf.get(recipeRef(m))).filter((p): p is string => !!p)));
  const signed = await getSignedUrls(RECIPE_PHOTO_BUCKET, wanted);

  const meals: PlannedMeal[] = rows.map((m) => {
    const shipped = m.recipe_key ? RECIPES_BY_KEY.get(m.recipe_key) : undefined;
    const own = m.family_recipes;
    const ingredients: PlannedIngredient[] = (m.meal_ingredients ?? [])
      .map((i) => {
        const key = i.item_key ?? normalizeKey(i.ingredient_name);
        return {
          id: i.id,
          name: i.ingredient_name,
          qty: i.qty,
          amount: i.qty_amount == null ? null : Number(i.qty_amount),
          unit: i.unit,
          key,
          inPantry: atHome.has(key),
          onList: openNames.has(key),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const ref = recipeRef(m);
    const path = photoOf.get(ref);

    return {
      id: m.id,
      dish: m.dish,
      slot: m.slot as MealSlot,
      planDate: m.plan_date,
      note: m.note,
      recipeKey: m.recipe_key,
      familyRecipeId: m.family_recipe_id,
      ref,
      photoUrl: path ? (signed[path] ?? null) : null,
      minutes: own?.minutes ?? shipped?.minutes ?? null,
      serves: own?.serves ?? shipped?.serves ?? null,
      steps: own?.steps ?? shipped?.steps ?? [],
      ingredients,
      /** Not in the house and not yet on the shopping list. */
      missing: ingredients.filter((i) => !i.inPantry && !i.onList).length,
      have: ingredients.filter((i) => i.inPantry).length,
      ingredientCount: ingredients.length,
      memberIds: (m.meal_plan_members ?? []).map((r: { member_id: string }) => r.member_id),
      cost: mealCost(ingredients, priceMap),
    };
  });

  return { meals, anchorISO };
}

/** One day's tally per member, per drink -- everyone in the house, even
 * members who haven't logged a sip, so the tracker reads as a checklist
 * rather than a list that only grows once someone taps it.
 *
 * Who counts as in the house is the Family tab's answer, not the members
 * table's: somebody who has left, or who has asked to join and not been let
 * in yet, has no business in today's drinking. */
export async function getLiquidIntake(familyId: string, dateISO: string): Promise<LiquidIntakeMember[]> {
  const supabase = await createClient();
  const [{ data: members }, { data: rows }] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name, avatar_url")
      .eq("family_id", familyId)
      .not("status", "in", "(pending,removed)")
      .order("created_at"),
    supabase.from("liquid_intake_log").select("member_id, type, glasses").eq("family_id", familyId).eq("log_date", dateISO),
  ]);

  const byMember = new Map<string, Record<LiquidIntakeType, number>>();
  for (const row of rows ?? []) {
    const entry = byMember.get(row.member_id) ?? { water: 0, juice: 0, milk: 0 };
    entry[row.type as LiquidIntakeType] = row.glasses;
    byMember.set(row.member_id, entry);
  }

  return (members ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    avatarUrl: m.avatar_url,
    glasses: byMember.get(m.id) ?? { water: 0, juice: 0, milk: 0 },
  }));
}

/** Which meals each open line on the list is for, by line id, soonest first:
 * "for Chicken adobo (Tue)". Lines nobody planned a meal around are absent. */
export async function getBuyItemMeals(familyId: string): Promise<Record<string, { dish: string; date: string }[]>> {
  const supabase = await createClient();
  const { data } = await supabase.from("buy_item_meals").select("buy_item_id, meal_plans(dish, plan_date)").eq("family_id", familyId);
  const out: Record<string, { dish: string; date: string }[]> = {};
  for (const link of data ?? []) {
    if (!link.meal_plans) continue;
    (out[link.buy_item_id] ??= []).push({ dish: link.meal_plans.dish, date: link.meal_plans.plan_date });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.date.localeCompare(b.date) || a.dish.localeCompare(b.dish));
  return out;
}

/** The household's suki and loyalty cards, by store, for the Buy list's
 * checkout (lib/loyalty-cards picks which show). RLS keeps them to the
 * household and out of kid view. */
export async function getLoyaltyCards(familyId: string): Promise<LoyaltyCard[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("loyalty_cards")
    .select("id, store, card_name, card_number, code_format, note")
    .eq("family_id", familyId)
    .order("store")
    .order("created_at");
  return (data ?? []).map((c) => ({ ...c, code_format: c.code_format === "none" ? "none" : "qr" }));
}

/** The stores the household has named on its list, newest first -- cleared
 * lines included, so last week's "Mercury Drug" is offered again. */
export async function getUsedStoreNames(familyId: string): Promise<{ store_kind: string | null; store_name: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buy_items")
    .select("store_kind, store_name")
    .eq("family_id", familyId)
    .not("store_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  return data ?? [];
}

/** The week's checkouts, newest first (20261023210000_buy_trips). The
 * database reads only the last seven days back. */
export async function getRecentTrips(familyId: string) {
  const supabase = await createClient();
  const tz = await householdZone();
  // Said in the household's own zone here, so the server and the phone print
  // the same day and time.
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const { data } = await supabase
    .from("buy_trips")
    .select("id, checked_out_at, budget, actual, savings, paid, item_count, items")
    .eq("family_id", familyId)
    .order("checked_out_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((t) => ({
    id: t.id,
    when: when(t.checked_out_at),
    budget: Number(t.budget),
    actual: Number(t.actual),
    savings: Number(t.savings),
    paid: t.paid == null ? null : Number(t.paid),
    itemCount: t.item_count,
    items: readTripLines(t.items),
  }));
}

export type RecentTrip = Awaited<ReturnType<typeof getRecentTrips>>[number];
