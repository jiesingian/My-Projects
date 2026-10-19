import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember, getSessionUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/actions/auth";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { familyDay, familyTime } from "@/lib/time";
import { mealsForTwoDays, namesSaid, plansForTwoDays, type HelperDay } from "@/lib/helper-access";
import { HelperBuyList } from "./helper-buy-list";
import { HelperPush } from "./helper-push";

export const metadata = { title: "Helper · Kin" };

const DAY_LABEL: Record<HelperDay, string> = { today: "Today", tomorrow: "Tomorrow" };

const heading = { font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "1.75rem 0 0.625rem" } as const;
const quiet = { fontSize: "0.8125rem", color: "var(--color-neutral-600)" } as const;

/** The helper's page: the kasambahay, yaya or driver (20261015121000).
 *
 * Outside the (app) layout on purpose -- nothing here assumes a member, and
 * nothing a member sees is fetched. Every section comes from one of the
 * helper functions, each of which checks the helper's row again (removed,
 * switch off, wrong household: refused), so the page shows only what the
 * database agrees to. A member who also helps another household can open
 * this from Settings; their own Kin stays the default. */
export default async function HelperPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (!(await getSessionUser())) redirect("/login");
  const supabase = await createClient();
  const [{ data: homes }, member] = await Promise.all([supabase.rpc("my_helper_households"), getCurrentMember()]);
  if (!homes?.length) redirect(member ? "/today" : "/onboarding/profile");

  const wanted = (await searchParams).h;
  const home = homes.find((h) => h.family_id === wanted) ?? homes[0];
  const tz = home.time_zone || "Asia/Manila";
  const now = new Date();
  const today = familyDay(now, tz);

  const [list, meals, plans] = await Promise.all([
    home.can_see_list ? supabase.rpc("helper_buy_items", { p_family: home.family_id }) : null,
    home.can_see_meals ? supabase.rpc("helper_meals", { p_family: home.family_id }) : null,
    home.can_see_kids_plans ? supabase.rpc("helper_family_plans", { p_family: home.family_id }) : null,
  ]);
  const mealDays = mealsForTwoDays(meals?.data ?? [], today);
  const kidsPlans = plansForTwoDays(plans?.data ?? [], now, tz);
  const nothing = !home.can_see_list && !home.can_see_meals && !home.can_see_kids_plans;

  return (
    <OnboardingShell>
      <Wordmark />
      <h1 style={{ fontSize: "1.5rem", margin: "1.5rem 0 0.25rem", overflowWrap: "anywhere" }}>{home.household}</h1>
      <p style={{ ...quiet, margin: 0 }}>You help here as {home.helper_name}.</p>

      {homes.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.875rem" }}>
          {homes.map((h) => (
            <Link key={h.family_id} href={`/helper?h=${h.family_id}`} className="chip" data-active={h.family_id === home.family_id}>
              {h.household}
            </Link>
          ))}
        </div>
      )}

      {nothing && <p style={{ fontSize: "0.9375rem", lineHeight: 1.5, marginTop: "1.5rem" }}>The family hasn&apos;t shared anything with you yet.</p>}

      {home.can_see_list && (
        <section aria-labelledby="helper-list">
          <h2 id="helper-list" style={heading}>TO-BUY LIST</h2>
          {list?.error ? (
            <p style={quiet}>The list didn&apos;t load. Try again in a moment.</p>
          ) : (
            <HelperBuyList familyId={home.family_id} items={list?.data ?? []} />
          )}
          <HelperPush familyId={home.family_id} />
        </section>
      )}

      {home.can_see_meals && (
        <section aria-labelledby="helper-meals">
          <h2 id="helper-meals" style={heading}>MEALS</h2>
          {(["today", "tomorrow"] as const).map((d) => (
            <div key={d} style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>{DAY_LABEL[d]}</div>
              {mealDays[d].length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.25rem" }}>
                  {mealDays[d].map((m, i) => (
                    <li key={`${m.slot}-${i}`} style={{ fontSize: "0.9375rem", overflowWrap: "anywhere" }}>
                      <span style={quiet}>{m.label} · </span>
                      {m.dish}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ ...quiet, margin: 0 }}>Nothing planned.</p>
              )}
            </div>
          ))}
        </section>
      )}

      {home.can_see_kids_plans && (
        <section aria-labelledby="helper-kids">
          <h2 id="helper-kids" style={heading}>FAMILY PLANS</h2>
          {(["today", "tomorrow"] as const).map((d) => {
            const day = kidsPlans.filter((p) => p.day === d);
            return (
              <div key={d} style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>{DAY_LABEL[d]}</div>
                {day.length ? (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
                    {day.map((p, i) => (
                      <li key={`${p.title}-${i}`} style={{ overflowWrap: "anywhere" }}>
                        <div style={{ fontSize: "0.9375rem" }}>
                          {familyTime(p.at, tz)}
                          {p.endAt ? `–${familyTime(p.endAt, tz)}` : ""} · {p.title}
                        </div>
                        <div style={quiet}>
                          {p.forWholeFamily ? "Whole family" : namesSaid(p.children)}
                          {p.place ? ` · ${p.place}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ ...quiet, margin: 0 }}>Nothing planned.</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <p style={{ ...quiet, margin: "2rem 0 0.75rem", lineHeight: 1.5 }}>{home.can_see_list ? "The list keeps itself up to date. " : ""}
        {home.can_see_meals || home.can_see_kids_plans ? `${home.can_see_list ? "Meals and plans as" : "As"} of ${familyTime(now, tz)}. Reopen the page to see the latest.` : ""}</p>
      {member ? (
        <Link href="/today" className="btn btn-secondary btn-block" style={{ minHeight: "2.75rem" }}>
          Back to your own Kin
        </Link>
      ) : (
        <>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.75rem" }}>
              Sign out
            </button>
          </form>
          <Link href="/onboarding/profile?own=1" className="btn btn-ghost btn-block" style={{ minHeight: "2.5rem", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
            Kin for your own family
          </Link>
        </>
      )}
    </OnboardingShell>
  );
}
