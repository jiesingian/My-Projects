import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMealPlanner, type PlannedMeal } from "@/lib/queries/household";
import { getAccounts } from "@/lib/queries/wealth";
import { getPriceBook, getPricedBuyList, getNextShoppingRun, getPantry } from "@/lib/queries/household-money";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Blueprint, Tag } from "@/components/ui";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";
import { PriceRowControl, AddPriceControl, PantryControls } from "@/components/household-price-controls";
import { SheetButton, Collapsible } from "@/components/sheet";
import { RecipeBook, AddIngredientsToBuyButton } from "@/components/recipe-book";
import { getRecipeBook } from "@/lib/queries/recipes";
import { AddMealControl, RemoveMealButton } from "@/components/meal-controls";
import { CalendarJump, DateRail, TodayButton } from "@/components/calendar-nav";
import { MealPhotoControl, IngredientAmountRow, AddIngredientRow } from "@/components/meal-day";
import { Icon } from "@/components/icons";
import { formatCurrency } from "@/lib/format";
import { PRICE_BOOK_SET_ON } from "@/lib/pricebook";
import { plateTone } from "@/lib/meal-photos";
import { MEAL_SLOTS, MEAL_SLOT_LABEL } from "@/lib/recipes";
import { MARKET_SECTIONS } from "@/lib/grocery";

const SEGMENTS = ["buy", "meals"] as const;
type Seg = (typeof SEGMENTS)[number];

const SEGMENT_LABEL: Record<Seg, string> = { buy: "To-buy", meals: "Meals" };

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ seg?: string; date?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "buy";
  const anchor = sp.date ? new Date(`${sp.date}T00:00:00`) : new Date();

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABEL[s], href: `/household?seg=${s}`, active: s === seg }));

  return (
    <div>
      <HubHeader n="04" title="Household" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "buy" && <BuyPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
        {seg === "meals" && <MealsPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} anchor={anchor} />}
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
<strong>Prices &amp; pantry</strong> below sets them.
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

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <SheetButton
          label="Prices & pantry"
          title="Prices & pantry"
          icon="receipt"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 40, fontSize: 13.5, gap: 6 }}
        >
          <PriceBookSheet familyId={familyId} currency={currency} />
        </SheetButton>
      </div>

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

async function PriceBookSheet({ familyId, currency }: { familyId: string; currency: string }) {
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

      <Collapsible title="Already in the house" meta={`${pantry.length}`} defaultOpen={pantry.length > 0}>
        <p style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "0 0 10px" }}>
          Skipped when a shopping list is built from the week&rsquo;s meals.
        </p>
        <PantryControls
          items={pantry.map((p) => ({ item_key: p.item_key, name: p.name, quantity: p.quantity == null ? null : Number(p.quantity), unit: p.unit }))}
        />
      </Collapsible>

      {/* Folded by default: a hundred and fifty prices is a reference, not
          something anyone reads top to bottom. */}
      {bySection.map((group) => (
        <Collapsible key={group.section} title={group.section} meta={`${group.items.length}`}>
          {group.items.map((row) => (
            <PriceRowControl key={row.key} itemKey={row.key} name={row.name} unit={row.unit} price={row.price} section={row.section} source={row.source} />
          ))}
        </Collapsible>
      ))}

      <AddPriceControl />
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 12 }}>
        Prices are in {currency}. They set the estimates on the to-buy list and on every meal.
      </p>
    </>
  );
}

const MEALS_HREF_BASE = "/household?seg=meals&date=";

async function MealsPane({
  familyId,
  memberId,
  currency,
  anchor,
}: {
  familyId: string;
  memberId: string;
  currency: string;
  anchor: Date;
}) {
  const [{ strip, meals, anchorISO }, recipes] = await Promise.all([getMealPlanner(familyId, anchor), getRecipeBook(familyId)]);
  const today = new Date();
  const selected = strip.find((d) => d.isSelected);
  const isToday = selected?.isToday ?? false;
  const label = anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  // The Monday of the week being looked at — what a shopping list built from
  // here would cover.
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));

  return (
    <>
      {/* The same header as the Planner's calendar: the title jumps to any
          month or day, and Today comes straight back. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <CalendarJump label={label} hrefBase={MEALS_HREF_BASE} anchor={anchorISO} />
        <SheetButton
          label={String(recipes.length)}
          title="Recipe book"
          icon="utensils"
          className="btn btn-secondary"
          style={{ minHeight: 34, fontSize: 13, padding: "0 10px", gap: 5 }}
        >
          <RecipeBook recipes={recipes} />
        </SheetButton>
        <TodayButton hrefBase={MEALS_HREF_BASE} />
      </div>

      {/* And the same rail: scroll sideways through the weeks, tap a day to
          plan it. The dots are the meals already down for that day. */}
      <DateRail anchor={anchorISO}>
        {strip.map((d) => {
          const first = d.date.getDate() === 1;
          return (
            <Link
              key={d.iso}
              href={`${MEALS_HREF_BASE}${d.iso}`}
              data-selected={d.isSelected}
              aria-current={d.isSelected ? "date" : undefined}
              style={{
                width: "calc((100% - 12px) / 7)",
                flex: "none",
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                padding: "4px 0 5px",
                borderRadius: 12,
                background: d.isSelected && !d.isToday ? "color-mix(in srgb, var(--color-text) 7%, transparent)" : "transparent",
                opacity: d.date < new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: 11, color: "var(--color-neutral-600)", height: 13 }}>
                {first ? d.date.toLocaleDateString("en-GB", { month: "short" }) : d.date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 1)}
              </span>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: d.isToday || d.isSelected ? 600 : 400,
                  background: d.isToday ? "var(--color-accent)" : "transparent",
                  color: d.isToday ? "#fff" : "var(--color-text)",
                  boxShadow: d.isSelected && !d.isToday ? "inset 0 0 0 1.5px var(--color-accent)" : "none",
                }}
              >
                {d.date.getDate()}
              </span>
              <span style={{ display: "flex", gap: 2, height: 4 }}>
                {d.slots.slice(0, 4).map((s, i) => (
                  <span key={`${s}-${i}`} style={{ width: 4, height: 4, borderRadius: 999, background: "var(--cal-home)" }} />
                ))}
              </span>
            </Link>
          );
        })}
      </DateRail>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "12px 0 4px" }}>
        <h2 style={{ font: "600 17px/1.2 var(--font-heading)", margin: 0 }}>
          {isToday ? "Today" : anchor.toLocaleDateString("en-GB", { weekday: "long" })}
          {" · "}
          {anchor.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
        </h2>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--color-neutral-600)" }}>
          {meals.length === 0 ? "nothing planned" : `${meals.length} planned`}
        </span>
      </div>

      {/* Every day carries all four parts, so an empty one reads as a gap to
          fill rather than something that does not exist. */}
      {MEAL_SLOTS.map((slot) => {
        const inSlot = meals.filter((m) => m.slot === slot);
        return (
          <div key={slot} style={{ padding: "10px 0 2px" }}>
            <div style={{ fontSize: 11.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 7 }}>
              {MEAL_SLOT_LABEL[slot]}
            </div>

            {inSlot.map((m) => (
              <DishCard key={m.id} meal={m} />
            ))}

            <AddMealControl date={anchorISO} slot={slot} />
          </div>
        );
      })}

      <div style={{ marginTop: 18 }}>
        <GenerateGroceryButton familyId={familyId} memberId={memberId} weekOf={anchorISO} />
      </div>
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 10, lineHeight: 1.45 }}>
        Building the list takes the ingredients from the meals planned for the week of{" "}
        {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, skips anything already in the house, and
        prices each one from your price book. Amounts are in {currency}.
      </p>
    </>
  );
}

/** One dish, given the room it deserves: its picture across the full width,
 * its name on the picture, and its amounts underneath where they can be
 * changed for this meal without opening the recipe. */
function DishCard({ meal }: { meal: PlannedMeal }) {
  const tone = plateTone(meal.dish);
  const meta = [
    MEAL_SLOT_LABEL[meal.slot],
    meal.minutes ? `${meal.minutes} min` : null,
    meal.serves ? `serves ${meal.serves}` : null,
  ].filter(Boolean);

  return (
    <div className="kin-dish">
      <div
        className={`kin-plate${meal.photoUrl ? "" : " kin-plate--glazed"}`}
        style={{ "--plate-from": tone.from, "--plate-to": tone.to } as React.CSSProperties}
      >
        {meal.photoUrl ? (
          // Signed Storage URLs expire, so this stays a plain img: next/image
          // would cache a URL that has already gone stale.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meal.photoUrl} alt={meal.dish} />
        ) : (
          // Until the house photographs its own, the dish gets a plate: its
          // own glaze, and a monogram struck once from the name.
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              color: tone.ink,
            }}
          >
            <span
              style={{
                width: 72,
                height: 72,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: `500 30px/1 var(--font-heading)`,
                letterSpacing: "0.04em",
                border: "1px solid rgba(247,226,178,0.7)",
                boxShadow: "0 0 0 5px rgba(247,226,178,0.10), inset 0 0 22px rgba(0,0,0,0.22)",
                textTransform: "uppercase",
              }}
            >
              {meal.dish.trim().charAt(0) || "?"}
            </span>
            <Icon name="utensils" size={14} style={{ opacity: 0.62 }} />
          </div>
        )}

        <div className="kin-plate-tools">
          <MealPhotoControl recipeRef={meal.ref} hasPhoto={!!meal.photoUrl} dish={meal.dish} />
          <RemoveMealButton mealId={meal.id} onPhoto />
        </div>

        <div className="kin-plate-scrim">
          <div style={{ font: "600 20px/1.2 var(--font-heading)", letterSpacing: "-0.01em" }}>{meal.dish}</div>
          <div style={{ fontSize: 12.5, opacity: 0.92, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
            {meal.minutes ? <Icon name="clock" size={12} /> : null}
            {meta.join(" · ")}
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--color-neutral-700)" }}>
            {meal.ingredientCount === 0
              ? "No ingredients listed yet"
              : meal.missing === 0
                ? meal.have === meal.ingredientCount
                  ? "Everything is in the house"
                  : "Everything is bought or in the house"
                : `${meal.missing} still to buy${meal.have > 0 ? ` · ${meal.have} already here` : ""}`}
          </span>
          <Tag variant={meal.missing === 0 && meal.ingredientCount > 0 ? "accent" : "neutral"}>
            {meal.ingredientCount === 0 ? "no list" : meal.missing === 0 ? "ready" : `${meal.missing} to buy`}
          </Tag>
        </div>

        {/* Amounts live here, on the day they are cooked: doubling a Sunday
            lunch is this meal's business, not a rewrite of the recipe. */}
        <Collapsible
          title="Ingredients & amounts"
          meta={meal.ingredientCount === 0 ? undefined : `${meal.ingredientCount}`}
          defaultOpen={meal.ingredientCount === 0}
        >
          {meal.ingredients.map((ing) => (
            <IngredientAmountRow
              key={ing.id}
              id={ing.id}
              name={ing.name}
              amount={ing.amount}
              unit={ing.unit}
              qty={ing.qty}
              inPantry={ing.inPantry}
              onList={ing.onList}
            />
          ))}
          <AddIngredientRow mealId={meal.id} />
          <p style={{ fontSize: 11.5, color: "var(--color-neutral-600)", margin: "10px 0 0", lineHeight: 1.45 }}>
            Ticking one says the house already has it, so it stays off every shopping list built from here.
          </p>
        </Collapsible>

        {meal.missing > 0 && (
          <div style={{ marginTop: 10 }}>
            <AddIngredientsToBuyButton mealId={meal.id} missing={meal.missing} />
          </div>
        )}
      </div>
    </div>
  );
}
