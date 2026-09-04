import { createClient } from "@/lib/supabase/server";
import { PRICE_BOOK, normalizeKey, resolveUnitPrice, sortForShopping, type PriceSource } from "@/lib/pricebook";
import { expandRoutine, toISODate, type RoutineRule } from "@/lib/routines";

/** The family's own prices, keyed for lookup. */
export async function loadFamilyPrices(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("price_list").select("*").eq("family_id", familyId);
  return new Map((data ?? []).map((row) => [row.item_key, row]));
}

export type PriceRow = {
  key: string;
  name: string;
  unit: string;
  price: number;
  section: string;
  /** Whether this is the family's own figure or the shipped estimate. */
  source: "family" | "starter";
  note: string | null;
  updatedAt: string | null;
};

/** The whole price book as the family sees it: everything Kin ships, with
 * their own corrections substituted in, plus anything they have added that
 * Kin never knew about. In aisle order. */
export async function getPriceBook(familyId: string): Promise<PriceRow[]> {
  const mine = await loadFamilyPrices(familyId);

  const rows: PriceRow[] = PRICE_BOOK.map((entry) => {
    const override = mine.get(entry.key);
    return override
      ? {
          key: entry.key,
          name: override.name,
          unit: override.unit,
          price: Number(override.unit_price),
          section: override.section,
          source: "family" as const,
          note: override.note,
          updatedAt: override.updated_at,
        }
      : { key: entry.key, name: entry.name, unit: entry.unit, price: entry.price, section: entry.section, source: "starter" as const, note: null, updatedAt: null };
  });

  const shipped = new Set(PRICE_BOOK.map((e) => e.key));
  for (const [key, row] of mine) {
    if (shipped.has(key)) continue;
    rows.push({
      key,
      name: row.name,
      unit: row.unit,
      price: Number(row.unit_price),
      section: row.section,
      source: "family",
      note: row.note,
      updatedAt: row.updated_at,
    });
  }

  return sortForShopping(rows);
}

export type PricedBuyItem = {
  id: string;
  name: string;
  section: string;
  unit: string | null;
  quantity: number | null;
  checked: boolean;
  memberId: string | null;
  /** What one costs, and where that figure came from. */
  unitPrice: number | null;
  priceSource: PriceSource | "override";
  /** unitPrice × quantity, or null when the price is unknown. */
  estimated: number | null;
  inPantry: boolean;
};

/** The buy list with a price against every line. An item Kin has never seen
 * and the family has not priced stays blank rather than counting as zero —
 * a total that quietly omits things is worse than one that admits a gap. */
export async function getPricedBuyList(familyId: string) {
  const supabase = await createClient();
  const [{ data: items }, prices, { data: pantry }] = await Promise.all([
    supabase.from("buy_items").select("*").eq("family_id", familyId).eq("cleared", false).order("created_at"),
    loadFamilyPrices(familyId),
    supabase.from("pantry_items").select("item_key").eq("family_id", familyId),
  ]);

  const priceMap = new Map([...prices].map(([k, v]) => [k, { unit_price: Number(v.unit_price), unit: v.unit }]));
  const inPantry = new Set((pantry ?? []).map((p) => p.item_key));

  const rows: PricedBuyItem[] = (items ?? []).map((it) => {
    const override = it.unit_price_override == null ? null : Number(it.unit_price_override);
    const looked = resolveUnitPrice(it.name, priceMap);
    const unitPrice = override ?? looked.price;
    const qty = it.quantity == null ? 1 : Number(it.quantity);
    return {
      id: it.id,
      name: it.name,
      section: it.section,
      unit: it.unit,
      quantity: it.quantity == null ? null : Number(it.quantity),
      checked: it.checked,
      memberId: it.member_id,
      unitPrice,
      priceSource: override != null ? "override" : looked.source,
      estimated: unitPrice == null ? null : Math.round(unitPrice * qty * 100) / 100,
      inPantry: inPantry.has(normalizeKey(it.name)),
    };
  });

  const priced = rows.filter((r) => r.estimated != null);
  return {
    items: rows,
    /** What the whole list is expected to come to. */
    estimatedTotal: priced.reduce((sum, r) => sum + (r.estimated ?? 0), 0),
    /** Still to buy — the part of the total that has not been ticked off. */
    estimatedRemaining: priced.filter((r) => !r.checked).reduce((sum, r) => sum + (r.estimated ?? 0), 0),
    /** How many lines Kin could not price, so the total can say so. */
    unpricedCount: rows.filter((r) => r.estimated == null).length,
  };
}

export type ShoppingRun = {
  id: string;
  title: string;
  date: Date;
  budget: number | null;
  accountId: string | null;
  /** A day booked on the to-buy list, or the next turn of a recurring
   * grocery routine. Both can be changed from the list; a routine's turn is
   * moved for that week only, which is why it carries its own date. */
  source: "trip" | "routine";
  /** For a routine: which occurrence this is, so moving it knows what to
   * take off the schedule. */
  occurrenceDate?: string;
};

/** The next shopping trip the household is heading for: a day booked on the
 * to-buy list, or the next turn of a grocery routine, whichever comes first,
 * with whatever budget was set against it. */
export async function getNextShoppingRun(familyId: string): Promise<ShoppingRun | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("routines")
    .select("id, title, kind, freq, repeat_interval, byweekday, bymonthday, start_date, end_date, time_of_day, expected_cost, cost_account_id")
    .eq("family_id", familyId)
    .eq("paused", false)
    .in("kind", ["grocery", "chore"]);

  const today = new Date();
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);

  let soonest: ShoppingRun | null = null;

  // A day booked straight onto the to-buy list. Today counts: a trip planned
  // for this morning is still the one being shopped for.
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const { data: trips } = await supabase
    .from("activities")
    .select("id, title, start_at, budget")
    .eq("family_id", familyId)
    .eq("kind", "shopping")
    .gte("start_at", startOfToday.toISOString())
    .order("start_at")
    .limit(1);

  // Which turns of those routines are already settled — the shopping run
  // that has been done, called off, or moved to another day.
  const { data: logs } = await supabase
    .from("routine_log")
    .select("routine_id, occurrence_date")
    .eq("family_id", familyId)
    .in("routine_id", (data ?? []).map((r) => r.id).concat("00000000-0000-0000-0000-000000000000"));

  const logged = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    const set = logged.get(l.routine_id) ?? new Set<string>();
    set.add(l.occurrence_date);
    logged.set(l.routine_id, set);
  }

  const trip = (trips ?? [])[0];
  if (trip) {
    soonest = {
      id: trip.id,
      title: trip.title,
      date: new Date(trip.start_at),
      budget: trip.budget == null ? null : Number(trip.budget),
      accountId: null,
      source: "trip",
    };
  }

  for (const r of data ?? []) {
    if (r.kind !== "grocery") continue;
    const rule: RoutineRule = {
      freq: r.freq as RoutineRule["freq"],
      repeat_interval: r.repeat_interval,
      byweekday: r.byweekday ?? [],
      bymonthday: r.bymonthday,
      start_date: r.start_date,
      end_date: r.end_date,
    };
    // A turn already done, skipped, or moved elsewhere is not the next one.
    const settled = logged.get(r.id) ?? new Set<string>();
    const next = expandRoutine(rule, today, horizon).find((o) => !settled.has(toISODate(o.date)));
    if (!next) continue;
    const at = r.time_of_day ? new Date(`${toISODate(next.date)}T${r.time_of_day}`) : next.date;
    if (!soonest || at < soonest.date) {
      soonest = {
        id: r.id,
        title: r.title,
        date: at,
        budget: r.expected_cost == null ? null : Number(r.expected_cost),
        accountId: r.cost_account_id,
        source: "routine",
        occurrenceDate: toISODate(next.date),
      };
    }
  }

  return soonest;
}

export async function getPantry(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("pantry_items").select("*").eq("family_id", familyId).order("name");
  return data ?? [];
}
