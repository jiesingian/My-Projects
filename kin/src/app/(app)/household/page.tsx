import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMealsForDay, type PlannedMeal } from "@/lib/queries/household";
import { getAccounts } from "@/lib/queries/wealth";
import { getPriceBook, getPricedBuyList, getNextShoppingRun, getPantry } from "@/lib/queries/household-money";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Blueprint, Tag } from "@/components/ui";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";
import { PriceRowControl, AddPriceControl, PantryControls } from "@/components/household-price-controls";
import { SheetButton, Collapsible } from "@/components/sheet";
import { RecipeBook, AddIngredientsToBuyButton } from "@/components/recipe-book";
import { getRecipeBook, getRecipeCategories } from "@/lib/queries/recipes";
import { AddMealControl, RemoveMealButton } from "@/components/meal-controls";
import { CalendarJump, TodayButton } from "@/components/calendar-nav";
import { MealPhotoControl, IngredientAmountRow, AddIngredientRow } from "@/components/meal-day";
import { Icon } from "@/components/icons";
import { PRICE_BOOK_SET_ON } from "@/lib/pricebook";
import { plateTone } from "@/lib/meal-photos";
import { MEAL_SLOTS, MEAL_SLOT_LABEL } from "@/lib/recipes";
import { MARKET_SECTIONS } from "@/lib/grocery";
import { toISODate } from "@/lib/routines";

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

async function BuyPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [{ groups, openCount, doneCount }, accounts, priced, run] = await Promise.all([
    getBuyItems(familyId),
    getAccounts(familyId),
    getPricedBuyList(familyId),
    getNextShoppingRun(familyId),
  ]);

  // Whichever comes first is what the list counts down to, and either can be
  // moved: a booked day is edited, a routine's turn is moved for that week
  // alone.
  const trip = run
    ? {
        id: run.id,
        title: run.title,
        iso: toISODate(run.date),
        time: `${String(run.date.getHours()).padStart(2, "0")}:${String(run.date.getMinutes()).padStart(2, "0")}`,
        budget: run.budget,
        source: run.source,
        occurrenceDate: run.occurrenceDate,
        when: run.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }),
      }
    : null;

  return (
    <>
      <BuyList
        groups={groups}
        openCount={openCount}
        doneCount={doneCount}
        familyId={familyId}
        currency={currency}
        unpriced={priced.unpricedCount}
        trip={trip}
        /* Server-rendered, handed to the client card as a slot: the sheet's
           contents are a server component and cannot be built inside one. */
        pricesSlot={
          <SheetButton
            label="Prices & pantry"
            title="Prices & pantry"
            icon="receipt"
            className="btn btn-secondary"
            style={{ minHeight: 30, fontSize: 12.5, padding: "0 9px", gap: 5 }}
          >
            <PriceBookSheet familyId={familyId} currency={currency} />
          </SheetButton>
        }
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
  const [{ meals, anchorISO }, recipes, categories] = await Promise.all([
    getMealsForDay(familyId, anchor),
    getRecipeBook(familyId),
    getRecipeCategories(familyId),
  ]);
  const today = new Date();
  const isToday = anchor.toDateString() === today.toDateString();
  // The title names the day itself, since the day is all this page shows.
  // The year only when it isn't this one — it is noise the rest of the time.
  const label =
    `${isToday ? "Today" : anchor.toLocaleDateString("en-GB", { weekday: "short" })} · ` +
    anchor.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      ...(anchor.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
    });

  const step = (days: number) => {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + days);
    return `${MEALS_HREF_BASE}${toISODate(d)}`;
  };

  // The Monday of the week being looked at — what a shopping list built from
  // here would cover.
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));

  return (
    <>
      {/* The date is a drop-down: tapping it opens the month, year and day
          picker. A meal plan is read one day at a time, so a whole rail of
          dates was more chrome than the page needed. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <CalendarJump label={label} hrefBase={MEALS_HREF_BASE} anchor={anchorISO} />
        <SheetButton
          label={String(recipes.length)}
          title="Recipe book"
          icon="utensils"
          className="btn btn-secondary"
          style={{ minHeight: 34, fontSize: 13, padding: "0 10px", gap: 5 }}
        >
          <RecipeBook recipes={recipes} categories={categories} />
        </SheetButton>
        <TodayButton hrefBase={MEALS_HREF_BASE} />
      </div>

      {/* One day either way without opening the picker — the step the rail
          used to make with a swipe. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 4 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--color-neutral-600)" }}>
          {meals.length === 0 ? "nothing planned" : `${meals.length} planned`}
        </span>
        <Link href={step(-1)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="The day before">
          <Icon name="chevronLeft" size={15} />
        </Link>
        <Link href={step(1)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="The day after">
          <Icon name="chevronLeft" size={15} style={{ transform: "rotate(180deg)" }} />
        </Link>
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
