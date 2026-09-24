import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getBuyItems, getMealsForDay, getLiquidIntake, type PlannedMeal } from "@/lib/queries/household";
import { getMembers } from "@/lib/queries/family";
import { MealWhoPicker } from "@/components/meal-who-picker";
import { MealWhoEditor } from "@/components/meal-who-editor";
import { LiquidIntakeTracker } from "@/components/liquid-intake-tracker";
import { getAccounts } from "@/lib/queries/wealth";
import { getPriceBook, getPricedBuyList, getNextShoppingRun, getPantry } from "@/lib/queries/household-money";
import { HubHeader } from "@/components/hub-header";
import { BuyList } from "@/components/buy-list";
import { Blueprint, Tag } from "@/components/ui";
import { GenerateGroceryButton } from "@/components/generate-grocery-button";
import { PriceRowControl, AddPriceControl, PantryControls } from "@/components/household-price-controls";
import { SheetButton, Collapsible } from "@/components/sheet";
import { RecipeBook, AddIngredientsToBuyButton } from "@/components/recipe-book";
import { CookFromPantry } from "@/components/cook-from-pantry";
import { rankByPantry } from "@/lib/pantry-match";
import { createClient } from "@/lib/supabase/server";
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
import { ZoomableImage } from "@/components/zoomable-image";

const SEGMENTS = ["buy", "meals"] as const;
type Seg = (typeof SEGMENTS)[number];

const SEGMENT_LABEL: Record<Seg, string> = { buy: "To-buy", meals: "Meals" };

export default async function HouseholdPage({ searchParams }: { searchParams: Promise<{ seg?: string; date?: string; who?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "buy";
  const anchor = sp.date ? new Date(`${sp.date}T00:00:00`) : new Date();

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABEL[s], href: `/household?seg=${s}`, active: s === seg }));

  return (
    <div>
      <HubHeader n="04" title="Household" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        {seg === "buy" && <BuyPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
        {seg === "meals" && <MealsPane familyId={me.family_id} currency={me.families.currency} anchor={anchor} who={sp.who ?? "all"} />}
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
            style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", gap: "0.3125rem" }}
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

      <Link href="/wealth?seg=cashflow" style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.875rem" }}>
        Bills now live in Wealth&rsquo;s Cash Flow tab, where they are paid from an account →
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
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem" }}>
        <div style={{ font: "600 1rem/1.2 var(--font-heading)", marginBottom: "0.3125rem" }}>What things cost here</div>
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 8px", lineHeight: 1.45 }}>
          Kin starts you off with typical supermarket prices, marked <strong>est</strong>. They are estimates, not live store
          prices — no supermarket publishes those, and they move week to week. Correct one as you shop and your figure is used
          from then on.
        </p>
        <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
          {mine === 0 ? `Estimates set ${PRICE_BOOK_SET_ON}. None corrected yet.` : `${mine} price${mine === 1 ? "" : "s"} set by your household.`}
        </div>
      </Blueprint>

      <Collapsible title="Already in the house" meta={`${pantry.length}`}>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 10px" }}>
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
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.75rem" }}>
        Prices are in {currency}. They set the estimates on the to-buy list and on every meal.
      </p>
    </>
  );
}

const MEALS_HREF_BASE = "/household?seg=meals&date=";

async function MealsPane({
  familyId,
  currency,
  anchor,
  who,
}: {
  familyId: string;
  currency: string;
  anchor: Date;
  who: string;
}) {
  const supabase = await createClient();
  const [{ meals: allMeals, anchorISO }, recipes, categories, liquidIntake, memberRows, { data: pantryRows }] = await Promise.all([
    getMealsForDay(familyId, anchor),
    getRecipeBook(familyId),
    getRecipeCategories(familyId),
    getLiquidIntake(familyId, toISODate(anchor)),
    getMembers(familyId),
    supabase.from("pantry_items").select("item_key").eq("family_id", familyId),
  ]);
  const suggestions = rankByPantry(recipes, new Set((pantryRows ?? []).map((p) => p.item_key))).map((m) => ({
    key: m.recipe.key,
    name: m.recipe.name,
    minutes: m.recipe.minutes,
    have: m.have,
    need: m.need,
    missing: m.missing,
  }));
  const members = memberRows
    .filter((m) => m.status === "active" || m.status === "managed")
    .map((m) => ({ id: m.id, name: m.full_name }));

  // A meal tagged for nobody is the household's, so it shows for whoever is
  // selected. That is the "shared by the family" case from the request, and
  // it is why filtering is an OR rather than an equality.
  const meals = who === "all" ? allMeals : allMeals.filter((m) => m.memberIds.length === 0 || m.memberIds.includes(who));
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
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.625rem" }}>
        <CalendarJump label={label} hrefBase={MEALS_HREF_BASE} anchor={anchorISO} />
        <SheetButton
          label={String(recipes.length)}
          title="Recipe book"
          icon="utensils"
          className="btn btn-secondary"
          style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.625rem", gap: "0.3125rem" }}
        >
          <RecipeBook recipes={recipes} categories={categories} />
        </SheetButton>
        <TodayButton hrefBase={MEALS_HREF_BASE} />
      </div>

      <div style={{ marginBottom: "0.5rem" }}>
        <MealWhoPicker members={members} who={who} date={anchorISO} />
      </div>

      {/* One day either way without opening the picker — the step the rail
          used to make with a swipe. */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", paddingBottom: "0.25rem" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {meals.length === 0 ? "nothing planned" : `${meals.length} planned`}
        </span>
        <Link href={step(-1)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="The day before">
          <Icon name="chevronLeft" size={15} />
        </Link>
        <Link href={step(1)} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="The day after">
          <Icon name="chevronLeft" size={15} style={{ transform: "rotate(180deg)" }} />
        </Link>
      </div>

      {/* Every day carries all five parts, so an empty one reads as a gap to
          fill rather than something that does not exist. */}
      {MEAL_SLOTS.map((slot) => {
        const inSlot = meals.filter((m) => m.slot === slot);
        return (
          <div key={slot} style={{ padding: "0.625rem 0 0.125rem" }}>
            <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.4375rem" }}>
              {MEAL_SLOT_LABEL[slot]}
            </div>

            {inSlot.map((m) => (
              <DishCard key={m.id} meal={m} members={members} />
            ))}

            <AddMealControl date={anchorISO} slot={slot} />
          </div>
        );
      })}

      <CookFromPantry date={anchorISO} suggestions={suggestions} />

      <LiquidIntakeTracker date={anchorISO} members={liquidIntake} />

      <div style={{ marginTop: "1.125rem" }}>
        <GenerateGroceryButton weekOf={anchorISO} />
      </div>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem", lineHeight: 1.45 }}>
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
function DishCard({ meal, members }: { meal: PlannedMeal; members: { id: string; name: string }[] }) {
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
          <ZoomableImage src={meal.photoUrl} alt={meal.dish} />
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
              gap: "0.4375rem",
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
          <div style={{ font: "600 1.25rem/1.2 var(--font-heading)", letterSpacing: "-0.01em" }}>{meal.dish}</div>
          <div style={{ fontSize: "0.78125rem", opacity: 0.92, marginTop: "0.125rem", display: "flex", alignItems: "center", gap: "0.3125rem" }}>
            {meal.minutes ? <Icon name="clock" size={12} /> : null}
            {meta.join(" · ")}
          </div>
        </div>
      </div>

      {/* Who it is for, under the plate. Editable in place because "actually
          only the children are eating this" is a thing somebody realises
          while looking at the day, not while creating the meal. */}
      <div style={{ marginTop: "0.3125rem" }}>
        <MealWhoEditor mealPlanId={meal.id} members={members} selected={meal.memberIds} />
      </div>

      <div style={{ padding: "0.625rem 0.75rem 0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
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
          <p style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "10px 0 0", lineHeight: 1.45 }}>
            Ticking one says the house already has it, so it stays off every shopping list built from here.
          </p>
        </Collapsible>

        {meal.missing > 0 && (
          <div style={{ marginTop: "0.625rem" }}>
            <AddIngredientsToBuyButton mealId={meal.id} missing={meal.missing} />
          </div>
        )}
      </div>
    </div>
  );
}
