import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getOnThisDay, getWeekRecap } from "@/lib/queries/memories";
import { OnThisDay, WeekRecapCard } from "@/components/memories";
import { getGlance, getTodayBriefing, getComingUp, type GlanceTile } from "@/lib/queries/today";
import { getRoutinesNeedingAttention, getPendingApprovals, getPendingRedemptions } from "@/lib/queries/routines";
import { TodayTaskList } from "@/components/today-task-list";
import { ApprovalQueue } from "@/components/approval-queue";
import { Icon } from "@/components/icons";
import { isGrownUp } from "@/lib/roles";
import { TodayHeader } from "@/components/family-panel";
import { LookOffer } from "@/components/look-offer";
import { PALETTE_DEFAULT } from "@/lib/palettes";
import { getFamilyPanel } from "@/lib/queries/family-panel";

export default async function TodayPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ data: members }, glance, brief, tasks, awaitingApproval, awaitingRedemption, familyPanel, comingUp, memories, recap] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id).order("created_at"),
    getGlance(me.family_id, me.families.currency),
    getTodayBriefing(me.family_id, me.families.currency),
    getRoutinesNeedingAttention(me.family_id),
    // Only a grown-up is ever asked to answer for a chore, so only a
    // grown-up pays for the query.
    isGrownUp(me.role) ? getPendingApprovals(me.family_id) : Promise.resolve([]),
    isGrownUp(me.role) ? getPendingRedemptions(me.family_id) : Promise.resolve([]),
    getFamilyPanel(me.family_id),
    getComingUp(me.family_id, me.families.currency),
    getOnThisDay(me.family_id),
    // The week in numbers, on the weekend and the Monday after: the time a
    // family looks back rather than at the next thing.
    ["Sat", "Sun", "Mon"].includes(new Date().toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Manila" }))
      ? getWeekRecap(me.family_id)
      : Promise.resolve(null),
  ]);

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).toUpperCase();

  // The fourth glance tile is built from what Today already asked for: the
  // chores and rewards waiting on a grown-up's OK, else the household's
  // chores due today or overdue.
  const toApprove = awaitingApproval.length + awaitingRedemption.length;
  const overdueTasks = tasks.filter((t) => t.overdue.length > 0).length;
  const waiting: GlanceTile =
    toApprove > 0
      ? { id: "waiting", icon: "check", value: `${toApprove} to approve`, label: "chores and rewards waiting for you", href: "#approvals" }
      : tasks.length > 0
        ? { id: "waiting", icon: "check", value: `${tasks.length} chore${tasks.length === 1 ? "" : "s"}`, label: overdueTasks > 0 ? `${overdueTasks} overdue` : "due today", href: "#tasks", warn: overdueTasks > 0 }
        : { id: "waiting", icon: "check", value: "All done", label: "no chores waiting", href: "/planner" };
  const tiles = [...glance, waiting];

  return (
    <div style={{ padding: "1.5rem 1.375rem 1.25rem" }}>
      <TodayHeader dateLabel={todayLabel} familyName={me.families.name} data={familyPanel} fallbackPeople={members ?? []} />

      {/* Offered once, to people still on Kin Classic from before the new
          look became the default. Anyone who picked another theme chose it,
          and keeps it without being asked. */}
      {me.palette === PALETTE_DEFAULT && !me.look_offer_answered_at && <LookOffer />}

      {/* The briefing. Everything the household has a date on, from every
          hub, in one list — overdue first, then the day in the order it
          happens. This is the answer to "why would anyone open this app on a
          Tuesday". On a quiet day it is one line, so the rest of the page
          moves up instead of sitting under an empty card. */}
      {brief.length === 0 ? (
        <p className="kin-allclear">
          <Icon name="check" size={15} />
          Nothing needs you today
        </p>
      ) : (
        <section style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Needs you today</h3>
          <div className="kin-brief">
            {brief.map((b) => (
              <Link key={b.id} href={b.href} className="kin-brief-row" data-urgent={b.urgent ? "true" : undefined}>
                <span className="kin-brief-ico" data-tint={b.tint}>
                  <Icon name={b.icon} size="1.0625rem" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="kin-brief-title">{b.title}</span>
                  <span className="kin-brief-meta">{b.meta}</span>
                </span>
                <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
              </Link>
            ))}
          </div>
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
        <Link href="/wealth/transact?mode=out" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="money"><Icon name="receipt" size={18} /></span>
          Expense
        </Link>
        <Link href="/household?seg=buy&add=1" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="home"><Icon name="basket" size={18} /></span>
          To buy
        </Link>
        <Link href="/planner/add?type=event" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="schedule"><Icon name="calendarDays" size={18} /></span>
          Event
        </Link>
        <Link href="/journal/new" className="kin-quick-btn">
          <span className="kin-quick-ico" data-tint="occasion"><Icon name="images" size={18} /></span>
          Journal
        </Link>
      </nav>

      {/* Coming up: what to sort out now so the week is not a scramble. */}
      {comingUp.length > 0 && (
        <section style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Coming up</h3>
          <div className="kin-brief">
            {comingUp.map((b) => (
              <Link key={b.id} href={b.href} className="kin-brief-row">
                <span className="kin-brief-ico" data-tint={b.tint}>
                  <Icon name={b.icon} size="1.0625rem" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="kin-brief-title">{b.title}</span>
                  <span className="kin-brief-meta">{b.meta}</span>
                </span>
                <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {recap && <WeekRecapCard recap={recap} />}

      <OnThisDay memories={memories} />

      <div id="approvals">
        <ApprovalQueue pending={awaitingApproval} redemptions={awaitingRedemption} />
      </div>

      <div id="tasks">
        <TodayTaskList tasks={tasks} />
      </div>
    </div>
  );
}
