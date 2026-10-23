import { householdZone } from "@/lib/household-zone";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { shortNames, selfLabel } from "@/lib/format";
import { isGone } from "@/lib/member-status";
import { isForMe } from "@/lib/for-me";
import { createClient } from "@/lib/supabase/server";
import { getOnThisDay, getWeekRecap } from "@/lib/queries/memories";
import { OnThisDay, WeekRecapCard } from "@/components/memories";
import { getGlance, getGoalsTile, getMedicineTile, getTodayBriefing, getTodayDoses, getComingUp, capComingUp, type GlanceTile } from "@/lib/queries/today";
import { getTodayWealth } from "@/lib/queries/today-wealth";
import { getTodayFamily } from "@/lib/queries/today-family";
import { SosOpenBanner } from "@/components/sos-open-banner";
import { doseAt } from "@/lib/today-doses";
import { getRoutinesNeedingAttention } from "@/lib/queries/routines";
import { TodayList, type TodayEntry } from "@/components/today-list";
import { TodayFold } from "@/components/today-fold";
import { todayCookieName, todayCounts, todaySummary } from "@/lib/today-fold";
import { cookies } from "next/headers";
import { familyClock, familyDay } from "@/lib/time";
import { QuickLine } from "@/components/quick-line";
import { QUICK_ICONS, readQuickPrefs, todayQuick } from "@/lib/quick-button";
import { ComingUpPager } from "@/components/coming-up-pager";
import { getKinOffer } from "@/lib/queries/offers";
import { canNameReferrer } from "@/lib/offers";
import { KinOfferCard } from "@/components/kin-offer-card";
import { ReferralEntry } from "@/components/referral-entry";
import { Icon } from "@/components/icons";
import { isGrownUp } from "@/lib/roles";
import { TodayHeader } from "@/components/family-panel";
import { LookOffer } from "@/components/look-offer";
import { TrialBanner } from "@/components/plus";
import { readAccess } from "@/lib/access";
import { PALETTE_DEFAULT } from "@/lib/palettes";
import { getFamilyPanel } from "@/lib/queries/family-panel";
import { inKidView } from "@/lib/kid-view";
import { KidToday } from "@/components/kid-today";
import { SimpleToday } from "@/components/simple-today";
import { inSimpleMode } from "@/lib/simple-mode";
import { StartHere } from "@/components/start-here";
import { getStartHere } from "@/lib/queries/start-here";
import { PlusTrialCard } from "@/components/plus-trial-card";
import { getPlusTrialCard } from "@/lib/queries/plus-trial";
import { HolidayLine } from "@/components/holiday-line";
import { ChristmasOnToday } from "@/components/christmas-on-today";
import { WhosWhere } from "@/components/whos-where";
import { ArrivedButton } from "@/components/arrived-button";
import { getMyPendingCheckIns } from "@/lib/queries/member-card";
import { LettersOpeningToday } from "@/components/letters-opening";
import { GuidedTour } from "@/components/guided-tour";
import { NextBillOffers } from "@/components/next-bill-offer";
import { getNextBillOffers } from "@/lib/queries/wealth";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ tour?: string; arrived?: string }> }) {
  const tz = await householdZone();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const params = await searchParams;
  // The Action Button's "Nakarating na ako" (/go/arrived) sends on arrival.
  const arrivedNow = params.arrived === "1";
  if (inKidView(me)) return <KidToday me={me} arrivedNow={arrivedNow} />;
  if (inSimpleMode(me)) return <SimpleToday me={me} arrivedNow={arrivedNow} />;
  // Settings -> Show me around replays the guided tour.
  const replayTour = params.tour === "1";

  const supabase = await createClient();
  const [{ data: members }, glance, brief, tasks, medicine, doses, goals, familyPanel, comingUp, memories, recap, startHere, kinOffer, checkIns, plusTrial, nextBills, wealth, family] = await Promise.all([
    supabase.from("members").select("id, full_name, status").eq("family_id", me.family_id).order("created_at"),
    getGlance(me.family_id, me.families.currency),
    getTodayBriefing(me.family_id, me.families.currency, me),
    // Chores that are the reader's (lib/for-me): theirs, the whole family's,
    // and for a grown-up the children's -- not another grown-up's own.
    getRoutinesNeedingAttention(me.family_id).then((all) => all.filter((r) => isForMe(me, r.appliesToAll, r.members))),
    // The medicines the reader gives today -- their own and, for a grown-up,
    // the children's -- as the tile's count (21 October) and as rows of the
    // list with their next dose to tick (Jonathan, 23 October).
    getMedicineTile(me),
    getTodayDoses(me),
    // The reader's targets today, "2 of 3" (decision 3, 23 October).
    getGoalsTile(me),
    getFamilyPanel(me.family_id),
    getComingUp(me.family_id, me.families.currency, me),
    getOnThisDay(me.family_id),
    // The week in numbers, on the weekend and the Monday after: the time a
    // family looks back rather than at the next thing.
    ["Sat", "Sun", "Mon"].includes(new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: tz }))
      ? getWeekRecap(me.family_id)
      : Promise.resolve(null),
    // A new family's first steps; null for everyone else (queries/start-here).
    getStartHere(me),
    // Kin's offer, if it's time for one; credits any taken offer now done.
    getKinOffer(me.role),
    // "Are you okay?" asks waiting on this person (the member card, 30 September).
    getMyPendingCheckIns(me.id),
    // The first days of a Kin Plus trial: three Plus things to try.
    getPlusTrialCard(me),
    // A paid repeating bill with no next one: "Add the next one?" (21
    // October), for a grown-up on Plus, where Wealth is theirs.
    isGrownUp(me.role) && readAccess(me.families).plus ? getNextBillOffers(me.family_id) : Promise.resolve([]),
    // Wealth's rows (23 October, decision 5): an utang's instalment, a
    // hulog, a loan or fund payment, income expected, a bill paid elsewhere,
    // the month's recap -- for a grown-up with Wealth, as bills are.
    isGrownUp(me.role) && readAccess(me.families).plus ? getTodayWealth(me) : Promise.resolve({ today: [], soon: [] }),
    // The rest of the household (23 October): a vault request, a message
    // that failed, a document running out, a card to sign, a linked
    // household's birthday; the monito-monita's day; an open SOS.
    getTodayFamily(me),
  ]);

  // Today's one list, ordered here on the server so the phone never re-sorts
  // it: urgent, then the day in order (all-day first), then what is finished.
  const minutes = (hhmm: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  };
  const ranked: { entry: TodayEntry; group: number; at: number }[] = [
    ...[...brief, ...wealth.today, ...family.today]
      .filter((b) => !b.id.startsWith("meal-"))
      .map((item) => ({
        entry: { kind: "item" as const, item },
        group: item.mark ? 2 : item.urgent ? 0 : 1,
        at: item.at != null ? minutes(familyClock(new Date(item.at), tz)) : -1,
      })),
    ...tasks
      .filter((t) => t.today)
      .map((task) => ({
        entry: { kind: "task" as const, task },
        group: task.today?.status ? 2 : 1,
        at: minutes(task.timeOfDay),
      })),
    // A medicine: late first, then at its next dose's time, sunk once every
    // dose of the day is taken.
    ...doses.map((dose) => ({
      entry: { kind: "dose" as const, dose },
      group: dose.next === null ? 2 : dose.late ? 0 : 1,
      at: doseAt(dose),
    })),
  ];
  const entries = ranked.sort((a, b) => a.group - b.group || a.at - b.at).map((r) => r.entry);
  // Behind on other days, whether or not it also falls today: a daily chore
  // missed all week was not counted while today's row showed (23 October).
  const behind = tasks.filter((t) => t.overdue.length > 0).length;
  const counts = todayCounts(entries);
  // The week ahead, Wealth's included, six a page.
  const soon = capComingUp([...comingUp, ...wealth.soon, ...family.soon]);

  // The household's day, not the server's (which is pinned to Manila): a
  // household abroad saw Manila's date here until the clock agreed.
  const todayLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).toUpperCase();

  // At a glance (Janine, 21 October): the reader's medicines today, their
  // targets today (23 October), the shopping and the money. Approvals and
  // rewards are the Shop's (Planner → Goals → Shop), not Today's.
  // Today's meal stands in for an empty shopping list: the Household tile
  // still says something worth a glance.
  const meal = brief.find((b) => b.id.startsWith("meal-"));
  const shopOrMeal: GlanceTile =
    glance.shop.value === "List clear" && meal ? { id: "shop", icon: "bowl", value: meal.title, label: `on today's menu · list clear`, href: "/household?seg=meals" } : glance.shop;
  // Medicine, then in the order of the tabs: Planner's Goals, Household's
  // shopping, Wealth's money.
  const tiles = [medicine, goals, shopOrMeal, glance.money];
  // Coming up's Who dropdown: the same names, and "Me", as the Planner's.
  const people = (members ?? []).filter((m) => m.status !== "pending" && !isGone(m.status));
  const peopleLabels = shortNames(people.map((m) => m.full_name)).map((l, i) => ({ id: people[i].id, label: selfLabel(l, people[i].id === me.id) }));

  return (
    <div style={{ padding: "1.5rem var(--gutter) 1.25rem" }}>
      <TodayHeader dateLabel={todayLabel} familyName={me.families.name} data={familyPanel} fallbackPeople={members ?? []} me={{ id: me.id, timezone: me.timezone }} checkIns={checkIns} />

      {/* Someone's SOS, until it is resolved: above everything (23 October). */}
      <SosOpenBanner alerts={family.sos} />

      {/* 1 December to 1 January: sleeps to Noche Buena, the Noche Buena plan, the
          gift list and the monito-monita (lib/christmas.ts); a household switch. */}
      <ChristmasOnToday />

      {/* Offered once, to people still on Kin Classic from before the new
          look became the default. Anyone who picked another theme chose it,
          and keeps it without being asked. */}
      {me.palette === PALETTE_DEFAULT && !me.look_offer_answered_at && <LookOffer />}

      {/* The last three days of a Kin Plus trial, and only then: before
          that it would be nagging, and after it the Plus areas say so where
          they are. The organizer gets the same push (due_trial_reminders). */}
      {(() => {
        const access = readAccess(me.families);
        return access.trialing && access.daysLeft !== null && access.daysLeft <= 3 ? <TrialBanner daysLeft={access.daysLeft} isOrganiser={me.is_organiser} /> : null;
      })()}

      {/* The Plus card's three (a bill, the vault, a medicine) are among Start
          here's eight while its bonus is open: one card asks, not two. */}
      {plusTrial && !(startHere?.bonus && typeof startHere.bonus === "object") && <PlusTrialCard steps={plusTrial.steps} daysLeft={plusTrial.daysLeft} />}

      {startHere && <StartHere steps={startHere.steps} bonus={startHere.bonus} inviteCode={me.families.invite_code} />}

      {/* A new household's first two weeks: who invited it, once. */}
      {isGrownUp(me.role) && canNameReferrer(me.families) && <ReferralEntry />}

      {/* Kin's own offers: days of Plus for trying something new, one at a
          time (20260929020000_kin_offers.sql). */}
      <KinOfferCard state={kinOffer} plus={readAccess(me.families).plus} comped={readAccess(me.families).status === "comped"} referralCode={me.families.referral_code} householdName={me.families.name} />

      {/* Today, as one list (Jonathan, 28 September: "shouldn't they be the
          same and prioritized at the top?"). What used to be "Needs you
          today" -- plans, bills, check-ups, birthdays, the shopping -- and
          "Today's tasks" -- the chores -- are one list, and every row can be
          answered: Done or Skip, or Pay and Shop where that happens elsewhere.
          Urgent first, then the day in order (all-day things at its start),
          finished ones sinking to the bottom with Undo. Meals are left to the
          header's "Eating today". On a quiet day it is one line. */}
      {/* A public holiday today or this week (lib/holidays). */}
      <HolidayLine />

      {entries.length === 0 ? (
        <p className="kin-allclear">
          <Icon name="check" size={15} />
          Nothing needs you today
        </p>
      ) : (
        <TodayFold memberId={me.id} open={(await cookies()).get(todayCookieName(me.id))?.value !== "0"} summary={todaySummary(counts)} urgent={counts.urgent > 0}>
          <TodayList entries={entries} />
          {behind > 0 && (
            <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", margin: "0.25rem 0 0" }}>
              <Icon name="info" size={16} style={{ color: "var(--cal-money-ink)" }} />
              <span>
                {behind} task{behind === 1 ? "" : "s"} behind on other days —{" "}
                <Link href="/planner?seg=routines" style={{ color: "var(--color-accent-700)", fontWeight: 500 }}>
                  catch up on Planner
                </Link>
              </span>
            </p>
          )}
        </TodayFold>
      )}

      {nextBills.length > 0 && <NextBillOffers offers={nextBills} currency={me.families.currency} heading="Next bills to add" />}

      {/* At a glance: one figure from each part of the household. These took
          the place of five hub cards that opened the same places as the
          bottom bar; a tile still opens its place, but it answers a question
          on the way. */}
      <section style={{ marginBottom: "1.625rem" }} data-tour="today">
        <h3 className="kin-eyebrow">At a glance</h3>
        <div className="kin-glance">
          {tiles.map((t) => (
            <Link key={t.id} href={t.href} className="kin-glance-tile" data-warn={t.warn ? "true" : undefined}>
              <span className="kin-glance-top">
                <Icon name={t.icon} size="0.9375rem" />
                <span className="kin-glance-value">{t.value}</span>
              </span>
              <span className="kin-glance-label">{t.label}</span>
              {t.progress !== undefined && (
                <span className="kin-glance-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round(Math.min(1, Math.max(0, t.progress)) * 100)}%` }} />
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Quick add: the things a family writes down most, and a private note, each straight
          into its form. Actions, not places -- the bottom bar already has the
          places. Above them, one-line add: type it and Kin files it. */}
      <QuickLine members={people.map((m) => ({ id: m.id, name: m.full_name }))} meId={me.id} today={familyDay(new Date(), tz)} currency={me.families.currency} />
      {/* Each member's own pick from the Action Button's list (Settings ->
          Action Button & widget, 23 October, decision 4); Milestone · Event ·
          Expense · Note until they pick (Janine, 12, 19 and 22 October). */}
      <nav aria-label="Quick add" className="kin-quick">
        {readQuickPrefs(me.quick_actions).today.map((id) => {
          const q = todayQuick(id);
          return (
            <Link key={id} href={q.href} className="kin-quick-btn">
              <span className="kin-quick-ico" data-tint={q.tint}><Icon name={QUICK_ICONS[id]} size={18} /></span>
              {q.label}
            </Link>
          );
        })}
      </nav>

      {/* "Nakarating na ako": one tap tells the household where you are. */}
      <ArrivedButton auto={arrivedNow} />

      {/* Who's where: only when someone in the household shares (item 10). */}
      <WhosWhere familyId={me.family_id} meId={me.id} tz={me.families.time_zone} />

      {/* Coming up: what to sort out now so the week is not a scramble. */}
      {soon.length > 0 && (
        <section style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Coming up</h3>
          {/* Whose, from the same Who dropdown as the Planner and Wealth. */}
          <ComingUpPager items={soon} people={peopleLabels} />
        </section>
      )}

      {recap && <WeekRecapCard recap={recap} href="/today/week" />}

      <LettersOpeningToday familyId={me.family_id} meId={me.id} timeZone={me.families.time_zone} />

      <OnThisDay memories={memories} />

      {/* Five spotlight steps, once per member and from Settings (guided-tour.tsx). */}
      <GuidedTour memberId={me.id} memberSince={me.created_at} replay={replayTour} />

    </div>
  );
}
