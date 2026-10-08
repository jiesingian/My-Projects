import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { shortNames, selfLabel } from "@/lib/format";
import { isGone } from "@/lib/member-status";
import { isForMe } from "@/lib/for-me";
import { createClient } from "@/lib/supabase/server";
import { getOnThisDay, getWeekRecap } from "@/lib/queries/memories";
import { OnThisDay, WeekRecapCard } from "@/components/memories";
import { getGlance, getTodayBriefing, getComingUp, type GlanceTile } from "@/lib/queries/today";
import { getRoutinesNeedingAttention, getPendingApprovals, getPendingRedemptions } from "@/lib/queries/routines";
import { TodayList, type TodayEntry } from "@/components/today-list";
import { familyClock } from "@/lib/time";
import { wrapUp, isWrapUpTime } from "@/lib/wrap-up";
import { EveningWrapUp } from "@/components/evening-wrap-up";
import { ApprovalQueue } from "@/components/approval-queue";
import { getGoalRequestsFor, getGoals, getRewardDuties, type GoalView } from "@/lib/queries/goals";
import { weekStartOf } from "@/lib/week";
import { ComingUpPager } from "@/components/coming-up-pager";
import { PromiseBanner } from "@/components/promise-banner";
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
import { StartHere } from "@/components/start-here";
import { getStartHere } from "@/lib/queries/start-here";
import { PlusTrialCard } from "@/components/plus-trial-card";
import { getPlusTrialCard } from "@/lib/queries/plus-trial";
import { HolidayLine } from "@/components/holiday-line";
import { WhosWhere } from "@/components/whos-where";
import { getMyPendingCheckIns } from "@/lib/queries/member-card";
import { LettersOpeningToday } from "@/components/letters-opening";

export default async function TodayPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (inKidView(me)) return <KidToday me={me} />;

  const supabase = await createClient();
  const [{ data: members }, glance, brief, tasks, awaitingApproval, awaitingRedemption, familyPanel, comingUp, memories, recap, startHere, goalRequests, rewardDuties, goals, kinOffer, checkIns, plusTrial] = await Promise.all([
    supabase.from("members").select("id, full_name, status").eq("family_id", me.family_id).order("created_at"),
    getGlance(me.family_id, me.families.currency, me),
    getTodayBriefing(me.family_id, me.families.currency, me),
    // Chores that are the reader's (lib/for-me): theirs, the whole family's,
    // and for a grown-up the children's -- not another grown-up's own.
    getRoutinesNeedingAttention(me.family_id).then((all) => all.filter((r) => isForMe(me, r.appliesToAll, r.members))),
    // Only a grown-up is ever asked to answer for a chore, so only a
    // grown-up pays for the query.
    isGrownUp(me.role) ? getPendingApprovals(me.family_id) : Promise.resolve([]),
    isGrownUp(me.role) ? getPendingRedemptions(me.family_id) : Promise.resolve([]),
    getFamilyPanel(me.family_id),
    getComingUp(me.family_id, me.families.currency, me),
    getOnThisDay(me.family_id),
    // The week in numbers, on the weekend and the Monday after: the time a
    // family looks back rather than at the next thing.
    ["Sat", "Sun", "Mon"].includes(new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Manila" }))
      ? getWeekRecap(me.family_id)
      : Promise.resolve(null),
    // A new family's first steps; null for everyone else (queries/start-here).
    getStartHere(me),
    // Goal rewards this person has been asked to give, and changes to goals
    // whose reward they give -- for anyone, child or grown-up.
    getGoalRequestsFor(me.family_id, me),
    // Promises due or waiting on this person's word: the banner that stays.
    getRewardDuties(me.family_id, me),
    // The goal tile in "At a glance" (28 September): it took the next-plan
    // tile's place, since the Planner and Coming up already show the plans.
    getGoals(me.family_id, me, weekStartOf(me.families.week_start)),
    // Kin's offer, if it's time for one; credits any taken offer now done.
    getKinOffer(me.role),
    // "Are you okay?" asks waiting on this person (the member card, 30 September).
    getMyPendingCheckIns(me.id),
    // The first days of a Kin Plus trial: three Plus things to try.
    getPlusTrialCard(me),
  ]);

  // Today's one list, ordered here on the server so the phone never re-sorts
  // it: urgent, then the day in order (all-day first), then what is finished.
  const minutes = (hhmm: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
  };
  const ranked: { entry: TodayEntry; group: number; at: number }[] = [
    ...brief
      .filter((b) => !b.id.startsWith("meal-"))
      .map((item) => ({
        entry: { kind: "item" as const, item },
        group: item.mark ? 2 : item.urgent ? 0 : 1,
        at: item.at != null ? minutes(familyClock(new Date(item.at))) : -1,
      })),
    ...tasks
      .filter((t) => t.today)
      .map((task) => ({
        entry: { kind: "task" as const, task },
        group: task.today?.status ? 2 : 1,
        at: minutes(task.timeOfDay),
      })),
  ];
  const entries = ranked.sort((a, b) => a.group - b.group || a.at - b.at).map((r) => r.entry);
  const behind = tasks.filter((t) => !t.today && t.overdue.length > 0).length;

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).toUpperCase();

  // The fourth glance tile is built from what Today already asked for: the
  // chores and rewards waiting on a grown-up's OK, else the household's
  // chores due today or overdue.
  const toApprove = awaitingApproval.length + awaitingRedemption.length + goalRequests.rewards.length + goalRequests.changes.length;
  const overdueTasks = tasks.filter((t) => t.overdue.length > 0).length;
  const waiting: GlanceTile =
    toApprove > 0
      ? { id: "waiting", icon: "check", value: `${toApprove} to approve`, label: "chores and rewards waiting for you", href: "#approvals" }
      : tasks.length > 0
        ? { id: "waiting", icon: "check", value: `${tasks.length} chore${tasks.length === 1 ? "" : "s"}`, label: overdueTasks > 0 ? `${overdueTasks} overdue` : "due today", href: "#tasks", warn: overdueTasks > 0 }
        : // Nothing to tick or answer: the next plan of the reader's instead.
          (glance.next ?? { id: "waiting", icon: "check", value: "All done", label: "nothing planned or waiting", href: "/planner" });
  // Today's meal stands in for an empty shopping list: the Household tile
  // still says something worth a glance.
  const meal = brief.find((b) => b.id.startsWith("meal-"));
  const shopOrMeal: GlanceTile =
    glance.shop.value === "List clear" && meal ? { id: "shop", icon: "bowl", value: meal.title, label: `on today's menu · list clear`, href: "/household?seg=meals" } : glance.shop;
  // In the order of the tabs (29 September): Planner's waiting-or-next and
  // goal, Household's shopping, Wealth's money.
  const tiles = [waiting, goalTile(goals, me.id), shopOrMeal, glance.money];
  // Coming up's Who dropdown: the same names, and "Me", as the Planner's.
  const people = (members ?? []).filter((m) => m.status !== "pending" && !isGone(m.status));
  const peopleLabels = shortNames(people.map((m) => m.full_name)).map((l, i) => ({ id: people[i].id, label: selfLabel(l, people[i].id === me.id) }));

  return (
    <div style={{ padding: "1.5rem var(--gutter) 1.25rem" }}>
      <TodayHeader dateLabel={todayLabel} familyName={me.families.name} data={familyPanel} fallbackPeople={members ?? []} me={{ id: me.id, timezone: me.timezone }} checkIns={checkIns} />

      {/* A promised reward that is due, or given and waiting for a word. First
          on the page and not dismissible: it goes when the promise is settled. */}
      <PromiseBanner duties={rewardDuties} />

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

      {plusTrial && <PlusTrialCard steps={plusTrial.steps} daysLeft={plusTrial.daysLeft} />}

      {startHere && <StartHere steps={startHere} inviteCode={me.families.invite_code} />}

      {/* A new household's first two weeks: who invited it, once. */}
      {isGrownUp(me.role) && canNameReferrer(me.families) && <ReferralEntry />}

      {/* Kin's own offers: days of Plus for trying something new, one at a
          time (20260929020000_kin_offers.sql). */}
      <KinOfferCard state={kinOffer} plus={readAccess(me.families).plus} referralCode={me.families.referral_code} />

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

      {/* From 6pm: what got done, what is open, and one tap to move the open
          plans to tomorrow (lib/wrap-up.ts). */}
      {entries.length > 0 && isWrapUpTime(familyClock(new Date())) && <EveningWrapUp wrap={wrapUp(entries)} />}

      {entries.length === 0 ? (
        <p className="kin-allclear">
          <Icon name="check" size={15} />
          Nothing needs you today
        </p>
      ) : (
        <section id="tasks" style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Today</h3>
          <TodayList entries={entries} />
          {behind > 0 && (
            <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", margin: "0.25rem 0 0" }}>
              <Icon name="info" size={16} style={{ color: "var(--cal-money)" }} />
              <span>
                {behind} task{behind === 1 ? "" : "s"} behind on other days —{" "}
                <Link href="/planner?seg=routines" style={{ color: "var(--color-accent-700)", fontWeight: 500 }}>
                  catch up on Planner
                </Link>
              </span>
            </p>
          )}
        </section>
      )}

      {/* At a glance: one figure from each part of the household. These took
          the place of five hub cards that opened the same places as the
          bottom bar; a tile still opens its place, but it answers a question
          on the way. */}
      <section style={{ marginBottom: "1.625rem" }}>
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

      {/* Quick add: the four things a family writes down most, each straight
          into its form. Actions, not places -- the bottom bar already has the
          places. */}
      <nav aria-label="Quick add" className="kin-quick">
        {/* In the order of the tabs, as At a glance is: Journal, Planner,
            Household, Wealth. */}
        <Link href="/journal/new" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="occasion"><Icon name="images" size={18} /></span>
          Journal
        </Link>
        <Link href="/planner/add?type=event" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="schedule"><Icon name="calendarDays" size={18} /></span>
          Event
        </Link>
        <Link href="/household?seg=buy&add=1" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="home"><Icon name="basket" size={18} /></span>
          To buy
        </Link>
        <Link href="/wealth/transact?mode=out" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="money"><Icon name="receipt" size={18} /></span>
          Expense
        </Link>
      </nav>

      {/* Who's where: only when someone in the household shares (item 10). */}
      <WhosWhere familyId={me.family_id} meId={me.id} tz={me.families.time_zone} />

      {/* Coming up: what to sort out now so the week is not a scramble. */}
      {comingUp.length > 0 && (
        <section style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Coming up</h3>
          {/* Whose, from the same Who dropdown as the Planner and Wealth. */}
          <ComingUpPager items={comingUp} people={peopleLabels} />
        </section>
      )}

      {recap && <WeekRecapCard recap={recap} href="/today/week" />}

      <LettersOpeningToday familyId={me.family_id} meId={me.id} timeZone={me.families.time_zone} />

      <OnThisDay memories={memories} />

      <div id="approvals">
        <ApprovalQueue pending={awaitingApproval} redemptions={awaitingRedemption} goalRewards={goalRequests.rewards} goalChanges={goalRequests.changes} />
      </div>

    </div>
  );
}

/** The reader's goal for "At a glance": their own unfinished one due soonest,
 * else a household goal still going, else their own finished one -- the
 * Planner's Goals, with the same ring. None yet: a way to set one. */
function goalTile(goals: GoalView[], meId: string): GlanceTile {
  const soonest = (list: GoalView[]) =>
    list
      .filter((g) => !g.reached)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0];
  const mine = goals.filter((g) => g.ownerId === meId);
  const g = soonest(mine) ?? soonest(goals.filter((x) => x.ownerId === null)) ?? mine[0];
  if (!g) return { id: "goal", icon: "target", value: "No goal yet", label: "set one in the Planner", href: "/planner/goals/new" };
  return {
    id: "goal",
    icon: "target",
    value: g.reached ? "Reached!" : g.noData ? "Not started" : `${Math.round(g.fraction * 100)}%`,
    label: g.title,
    href: "/planner?seg=goals",
    progress: g.noData ? undefined : g.fraction,
  };
}
