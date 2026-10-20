import Link from "next/link";
import { Icon } from "@/components/icons";
import { NocheBuenaPlanner } from "@/components/noche-buena-planner";
import { getCurrentMember } from "@/lib/session";
import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { familyDay, readableDay } from "@/lib/time";
import { isGrownUp } from "@/lib/roles";
import { inKidView } from "@/lib/kid-view";
import { christmasCountdown, dishesLine, giftListLine, isChristmasSeason, nocheBuenaDate, nocheBuenaDishes } from "@/lib/christmas";
import { getGiftList } from "@/lib/queries/gift-list";
import { listTotals } from "@/lib/gift-list";
import { getMyDraws } from "@/lib/queries/gift-draw";
import { formatCurrency } from "@/lib/format";

/** Christmas on Today (20261020212000_christmas_on_today.sql), 1 December to
 * 1 January in the household's zone, unless the household turned it off:
 * the count of sleeps to Noche Buena, the ready Noche Buena plan (or what
 * is planned already), the gift list (grown-ups) and the monito-monita.
 * Its own fetch, like HolidayLine, so Today and Simple Kin's Today only
 * place it. `simple` draws the same things as Simple Kin's big rows. */
export async function ChristmasOnToday({ simple = false }: { simple?: boolean }) {
  const me = await getCurrentMember();
  if (!me || me.families.christmas_on_today === false || inKidView(me)) return null;
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  if (!isChristmasSeason(today)) return null;
  const countdown = christmasCountdown(today);
  if (!countdown) return null;
  const grownUp = isGrownUp(me.role);
  const date = nocheBuenaDate(today);
  const year = Number(date.slice(0, 4));
  const supabase = await createClient();
  const [{ data: planned }, gifts, draws] = await Promise.all([
    supabase.from("meal_plans").select("dish, recipe_key").eq("family_id", me.family_id).eq("plan_date", date).eq("slot", "dinner").order("position"),
    grownUp ? getGiftList(me.family_id, year) : Promise.resolve(null),
    getMyDraws(),
  ]);
  const plannedDishes = (planned ?? []).map((p) => p.dish);
  const mealsHref = `/household?seg=meals&date=${date}`;
  const beforeNocheBuena = date >= today;
  const money = (n: number) => formatCurrency(n, me.families.currency);
  const totals = gifts ? listTotals(gifts.people) : null;
  const drawsLine = draws.length > 0 ? draws.map((d) => `${d.title}${d.drawn ? " · drawn" : d.mine ? "" : ` · ${d.hostName}`}`).join(", ") : "Draw names for the gift exchange";

  if (simple) {
    return (
      <section aria-labelledby="simple-pasko" className="kin-pasko kin-pasko-simple">
        <h3 id="simple-pasko" className="kin-simple-h">
          Pasko
        </h3>
        <div className="kin-simple-list">
          <div className="kin-simple-row" style={{ cursor: "default" }}>
            <Icon name="star" size="1.5rem" />
            <span style={{ minWidth: 0 }}>
              <span className="kin-simple-row-title">{countdown.title}</span>
              <span className="kin-simple-row-meta">{countdown.meta}</span>
            </span>
          </div>
          <Link href={mealsHref} className="kin-simple-row">
            <Icon name="utensils" size="1.5rem" />
            <span style={{ minWidth: 0 }}>
              <span className="kin-simple-row-title">Noche Buena</span>
              <span className="kin-simple-row-meta">{plannedDishes.length > 0 ? dishesLine(plannedDishes) : beforeNocheBuena ? "Plan the table in Meals" : "Was on 24 December"}</span>
            </span>
          </Link>
          {grownUp && totals && (
            <Link href="/planner/gifts" className="kin-simple-row">
              <Icon name="gift" size="1.5rem" />
              <span style={{ minWidth: 0 }}>
                <span className="kin-simple-row-title">Gifts and aguinaldo</span>
                <span className="kin-simple-row-meta">{giftListLine(totals, money)}</span>
              </span>
            </Link>
          )}
          <Link href="/planner/monito" className="kin-simple-row">
            <Icon name="gift" size="1.5rem" />
            <span style={{ minWidth: 0 }}>
              <span className="kin-simple-row-title">Monito-monita</span>
              <span className="kin-simple-row-meta">{drawsLine}</span>
            </span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="kin-pasko" aria-labelledby="pasko-h" style={{ marginBottom: "1.625rem" }}>
      <h3 id="pasko-h" className="kin-eyebrow">
        Pasko
      </h3>
      <p className="kin-pasko-count">
        <Icon name="star" size={18} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", font: "600 1.125rem/1.2 var(--font-heading)" }}>{countdown.title}</span>
          <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{countdown.meta}</span>
        </span>
      </p>

      <div className="kin-pasko-card">
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.375rem" }}>
          <Icon name="utensils" size={16} />
          <span style={{ fontWeight: 600 }}>Noche Buena</span>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>· {readableDay(date)}</span>
        </div>
        {plannedDishes.length > 0 ? (
          <p style={{ margin: 0, fontSize: "0.875rem" }}>
            {dishesLine(plannedDishes)}.{" "}
            <Link href={mealsHref}>Change it in Meals</Link>
          </p>
        ) : beforeNocheBuena ? (
          <>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
              A ready plan for the table at midnight. Untick what you won&rsquo;t make; one tap plans the rest for 24 December and puts what they need on the To-Buy list.
            </p>
            <NocheBuenaPlanner dishes={nocheBuenaDishes()} canPlan={grownUp} mealsHref={mealsHref} />
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>Noche Buena was on 24 December. Media Noche is in Meals, if you plan it.</p>
        )}
      </div>

      <div className="kin-pasko-links">
        {grownUp && totals && (
          <Link href="/planner/gifts" className="kin-potluck-invite">
            <Icon name="gift" size={18} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 600 }}>Christmas gifts and aguinaldo</span>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{giftListLine(totals, money)}</span>
            </span>
          </Link>
        )}
        <Link href="/planner/monito" className="kin-potluck-invite">
          <Icon name="gift" size={18} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600 }}>Monito-monita</span>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{drawsLine}</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
