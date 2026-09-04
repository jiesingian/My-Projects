import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMeals } from "@/lib/queries/household";
import { getAccounts } from "@/lib/queries/wealth";
import { getPriceBook, getPricedBuyList, getNextShoppingRun, getPantry } from "@/lib/queries/household-money";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Blueprint, Tag } from "@/components/ui";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";
import { PriceRowControl, AddPriceControl, PantryControls } from "@/components/household-price-controls";
import { AddMealControl, RemoveMealButton } from "@/components/meal-controls";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { PRICE_BOOK_SET_ON } from "@/lib/pricebook";
import { MEAL_SLOTS, MEAL_SLOT_LABEL, RECIPES_BY_KEY, type MealSlot } from "@/lib/recipes";
import { MARKET_SECTIONS } from "@/lib/grocery";
import { toISODate } from "@/lib/routines";

const SEGMENTS = ["buy", "pricelist", "meals"] as const;
type Seg = (typeof SEGMENTS)[number];

const SEGMENT_LABEL: Record<Seg, string> = { buy: "To-buy", pricelist: "Prices", meals: "Meals" };

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ seg?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "buy";

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABEL[s], href: `/household?seg=${s}`, active: s === seg }));

  return (
    <div>
      <HubHeader n="04" title="Household" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "buy" && <BuyPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
        {seg === "pricelist" && <PricelistPane familyId={me.family_id} currency={me.families.currency} />}
        {seg === "meals" && <MealsPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
      </div>
    </div>
  );
}

/** What the trip is expected to cost, against the day it happens and the
 * money set aside for it — the three things that decide whether the list as
 * it stands is affordable. */
function ShoppingBudgetCard({
  run,
  remaining,
  unpriced,
  currency,
}: {
  run: { id: string; title: string; date: Date; budget: number | null } | null;
  remaining: number;
  unpriced: number;
  currency: string;
}) {
  const over = run?.budget != null && remaining > run.budget;

  return (
    <Blueprint style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Still to buy</span>
        <span style={{ marginLeft: "auto", font: "600 22px/1 var(--font-heading)" }}>{formatCurrency(remaining, currency)}</span>
      </div>

      {unpriced > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)", marginBottom: 8 }}>
          {unpriced === 1 ? "One item has no price yet" : `${unpriced} items have no price yet`} — the total leaves them out.{" "}
          <Link href="/household?seg=pricelist" style={{ textDecoration: "none" }}>
            Set prices
          </Link>
        </div>
      )}

      {run ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5 }}>
            <Icon name="basket" size={15} style={{ color: "var(--cal-schedule)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {run.title} · {run.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
            </span>
            <Link href="/planner?seg=routines" style={{ fontSize: 12.5, textDecoration: "none", flex: "none" }}>
              Change
            </Link>
          </div>

          {run.budget != null ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5 }}>
                <span style={{ color: "var(--color-neutral-700)" }}>Budget for this run</span>
                <span style={{ marginLeft: "auto", fontWeight: 500 }}>{formatCurrency(run.budget, currency)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, run.budget > 0 ? (remaining / run.budget) * 100 : 0)}%`,
                    background: over ? "var(--cal-money)" : "var(--color-switch-on)",
                  }}
                />
              </div>
              <div style={{ fontSize: 12.5, color: over ? "var(--cal-money)" : "var(--color-neutral-700)" }}>
                {over
                  ? `${formatCurrency(remaining - run.budget, currency)} over the budget set for this run.`
                  : `${formatCurrency(run.budget - remaining, currency)} left in the budget for this run.`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>
              No budget set for this run.{" "}
              <Link href="/planner?seg=routines" style={{ textDecoration: "none" }}>
                Give it one
              </Link>{" "}
              and marking it done posts the spend to Wealth.
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)", paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
          No grocery run scheduled.{" "}
          <Link href="/planner/routines/new" style={{ textDecoration: "none" }}>
            Set one up
          </Link>{" "}
          to tie this list to a day and a budget.
        </div>
      )}
    </Blueprint>
  );
}

async function BuyPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [{ groups, openCount, doneCount }, accounts, priced, run] = await Promise.all([
    getBuyItems(familyId),
    getAccounts(familyId),
    getPricedBuyList(familyId),
    getNextShoppingRun(familyId),
  ]);

  return (
    <>
      <ShoppingBudgetCard run={run} remaining={priced.estimatedRemaining} unpriced={priced.unpricedCount} currency={currency} />

      <BuyList
        groups={groups}
        openCount={openCount}
        doneCount={doneCount}
        familyId={familyId}
        currency={currency}
        prices={Object.fromEntries(
          priced.items.map((it) => [it.id, { estimated: it.estimated, unitPrice: it.unitPrice, source: it.priceSource, inPantry: it.inPantry }]),
        )}
        accounts={accounts
          .filter((a) => a.is_joint || a.owner_member_id === memberId)
          .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }))}
      />

      <Link href="/wealth?seg=bills" style={{ display: "block", fontSize: 13, color: "var(--color-neutral-600)", marginTop: 14 }}>
        Bills now live in Wealth, where they are paid from an account →
      </Link>
    </>
  );
}

async function PricelistPane({ familyId, currency }: { familyId: string; currency: string }) {
  const [rows, pantry] = await Promise.all([getPriceBook(familyId), getPantry(familyId)]);
  const mine = rows.filter((r) => r.source === "family").length;

  const bySection = MARKET_SECTIONS.map((section) => ({ section, items: rows.filter((r) => r.section === section) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <>
      <Blueprint style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ font: "600 16px/1.2 var(--font-heading)", marginBottom: 5 }}>What things cost here</div>
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)", margin: "0 0 8px", lineHeight: 1.45 }}>
          Kin starts you off with typical supermarket prices, marked <strong>est</strong>. They are estimates, not live store
          prices — no supermarket publishes those, and they move week to week. Correct one as you shop and your figure is used
          from then on.
        </p>
        <div style={{ fontSize: 12.5, color: "var(--color-neutral-700)" }}>
          {mine === 0 ? `Estimates set ${PRICE_BOOK_SET_ON}. None corrected yet.` : `${mine} price${mine === 1 ? "" : "s"} set by your household.`}
        </div>
      </Blueprint>

      <Blueprint style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ font: "600 16px/1.2 var(--font-heading)", marginBottom: 3 }}>Already in the house</div>
        <p style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "0 0 10px" }}>
          Skipped when a shopping list is built from the week&rsquo;s meals.
        </p>
        <PantryControls
          items={pantry.map((p) => ({ item_key: p.item_key, name: p.name, quantity: p.quantity == null ? null : Number(p.quantity), unit: p.unit }))}
        />
      </Blueprint>

      {bySection.map((group) => (
        <div key={group.section} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 2 }}>
            {group.section}
          </div>
          {group.items.map((row) => (
            <PriceRowControl key={row.key} itemKey={row.key} name={row.name} unit={row.unit} price={row.price} section={row.section} source={row.source} />
          ))}
        </div>
      ))}

      <AddPriceControl />
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 12 }}>
        Prices are in {currency}. They set the estimates on the to-buy list and on every meal.
      </p>
    </>
  );
}

async function MealsPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const meals = await getMeals(familyId);

  // Monday to Sunday, so a plan is read the way a week is lived.
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));

  const byDay = new Map<string, typeof meals>();
  for (const m of meals) {
    const list = byDay.get(m.plan_date) ?? [];
    list.push(m);
    byDay.set(m.plan_date, list);
  }

  return (
    <>
      {days.map((day) => {
        const iso = toISODate(day);
        const forDay = byDay.get(iso) ?? [];
        const isToday = day.toDateString() === today.toDateString();

        return (
          <div key={iso} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ font: "600 14px/1 var(--font-heading)", color: isToday ? "var(--color-accent)" : "var(--color-text)" }}>
                {isToday ? "Today" : day.toLocaleDateString("en-GB", { weekday: "long" })}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                {day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            </div>

            {/* Every day carries all four parts, so an empty one reads as a
                gap to fill rather than something that does not exist. */}
            {MEAL_SLOTS.map((slot) => {
              const inSlot = forDay.filter((m) => (m.slot as MealSlot) === slot);
              return (
                <div key={slot} style={{ padding: "6px 0 2px" }}>
                  <div style={{ fontSize: 11.5, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 2 }}>
                    {MEAL_SLOT_LABEL[slot]}
                  </div>

                  {inSlot.map((m) => {
                    const recipe = m.recipe_key ? RECIPES_BY_KEY.get(m.recipe_key) : undefined;
                    return (
                      <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 500 }}>{m.dish}</div>
                          <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                            {m.ingredientCount === 0
                              ? "No ingredients listed"
                              : m.missing === 0
                                ? m.have === m.ingredientCount
                                  ? "Everything is in the house"
                                  : "Everything is bought or in the house"
                                : `${m.missing} still to buy${m.have > 0 ? ` · ${m.have} already here` : ""}`}
                            {recipe ? ` · ${recipe.minutes} min` : ""}
                          </div>
                          {m.ingredientCount > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                              {m.ingredients.map((ing) => (
                                <span
                                  key={ing.key}
                                  title={ing.inPantry ? "Already in the house" : ing.onList ? "On the shopping list" : "Not bought yet"}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                    fontSize: 11.5,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: ing.inPantry
                                      ? "color-mix(in srgb, var(--color-switch-on) 16%, transparent)"
                                      : ing.onList
                                        ? "color-mix(in srgb, var(--cal-schedule) 14%, transparent)"
                                        : "color-mix(in srgb, var(--color-text) 6%, transparent)",
                                    color: "var(--color-text)",
                                  }}
                                >
                                  {ing.inPantry && <Icon name="check" size={10} style={{ color: "var(--color-switch-on)" }} />}
                                  {ing.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Tag variant={m.missing === 0 ? "accent" : "neutral"} className="self-start">
                          {m.missing === 0 ? "ready" : `${m.missing} to buy`}
                        </Tag>
                        <RemoveMealButton mealId={m.id} />
                      </div>
                    );
                  })}

                  <AddMealControl date={iso} slot={slot} />
                </div>
              );
            })}
          </div>
        );
      })}

      <GenerateGroceryButton familyId={familyId} memberId={memberId} />
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 10, lineHeight: 1.45 }}>
        Building the list takes the ingredients from this week&rsquo;s meals, skips anything already in the house, and prices
        each one from your price book. Amounts are in {currency}.
      </p>
    </>
  );
}
