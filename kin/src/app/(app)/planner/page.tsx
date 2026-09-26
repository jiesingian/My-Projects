import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { memberColourVar } from "@/lib/member-colours";
import { RewardsShelf } from "@/components/rewards-shelf";
import {
  getWeekAgenda,
  getMonthsOverview,
  getYearOverview,
  getEvents,
  getOneOffTasks,
  getCalendarSyncStatus,
  hasAnyCalendarRecords,
  type PlannerCalendarItem,
} from "@/lib/queries/planner";
import { getMembers } from "@/lib/queries/family";
import { getAccounts } from "@/lib/queries/wealth";
import { syncGoogleCalendarIfStale } from "@/lib/actions/calendar-sync";
import { HubHeader } from "@/components/hub-header";
import { PickButton } from "@/components/pick-button";
import { Blueprint, Tag } from "@/components/ui";
import { formatAccounting, shortNames, selfLabel } from "@/lib/format";
import { InviteCard } from "@/components/invite-card";
import { AddToJournalButton } from "@/components/add-to-journal-button";
import { Icon } from "@/components/icons";
import { CALENDAR_LEGEND, styleFor } from "@/lib/calendar-style";
import { parseHidden, serializeHidden, toggledHidden, type CalendarGroup } from "@/lib/calendar-groups";
import { familyClock, familyDateLong, familyDay } from "@/lib/time";
import { dayColumn, startOfWeek, weekdayInitials, weekStartOf, type WeekStart } from "@/lib/week";
import { LogSpendControl } from "@/components/money-actions";
import { CalendarJump, CalendarPeriod, DateRail, MonthScroller, TodayButton } from "@/components/calendar-nav";
import { AddToCalendar } from "@/components/add-to-calendar";
import { getRoutines, getMemberScores, getRewards, type MemberScore } from "@/lib/queries/routines";
import { describeRule, formatTimeOfDay, ROUTINE_KIND_META, type RoutineKind } from "@/lib/routines";
import { RoutineTick, RoutineOccurrences, RoutinePauseButton, RoutineDeleteButton } from "@/components/routine-controls";
import { CalendarSyncStatus, RememberFilter } from "@/components/calendar-sync-status";
import { cookies } from "next/headers";
import { familyDate } from "@/lib/format-family";

const SEGMENTS = ["calendar", "routines", "events"] as const;
type Seg = (typeof SEGMENTS)[number];
const CALENDAR_VIEWS = ["week", "month", "year"] as const;
type CalendarView = (typeof CALENDAR_VIEWS)[number];

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; who?: string; view?: string; date?: string; hide?: string; saved?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "calendar";
  const who = sp.who ?? "all";
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as CalendarView) : "week";
  const anchor = sp.date ? new Date(`${sp.date}T00:00:00`) : new Date();
  // An absent param means "no preference stated" — fall back to what was
  // last chosen. An empty one (from Show all) means "explicitly nothing".
  const remembered = sp.hide === undefined ? (await cookies()).get("kin_cal_hide")?.value : undefined;
  const hidden = parseHidden(sp.hide ?? remembered);

  // Deliberately not awaited. This is a full two-way reconcile with Google —
  // every upcoming item pushed to each connected member's calendar, then each
  // of those calendars pulled back — so awaiting it meant whoever happened to
  // open the Planner after it went stale paid for the entire round of Google
  // API calls before seeing a single day. after() runs it once the response is
  // already on its way: the same five-minute rhythm, nobody waiting on it. It
  // already swallows its own errors.
  after(() => syncGoogleCalendarIfStale(me.family_id, 5 * 60 * 1000));

  const segments = SEGMENTS.map((s) => ({
    // "Tasks" reads far better than "Routines" to the people actually using
    // it -- the underlying seg=routines param, table, and every internal
    // name stay as they are; only what's printed on screen changes.
    label: s === "routines" ? "Tasks" : s[0].toUpperCase() + s.slice(1),
    href: `/planner?seg=${s}&who=${who}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="03" title="Planner" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        {seg === "calendar" && (
          <CalendarPane
            familyId={me.family_id}
            meId={me.id}
            who={who}
            view={view}
            anchor={anchor}
            hidden={hidden}
            weekStart={weekStartOf(me.families.week_start)}
          />
        )}
        {seg === "routines" && <RoutinesPane familyId={me.family_id} who={who} currency={me.families.currency} justSaved={sp.saved === "1"} />}
        {seg === "events" && <EventsPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} who={who} />}
      </div>
    </div>
  );
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `hide` is always present, even when empty: that is how "Show all" is told
 * apart from arriving fresh with no preference stated. */
function calendarHref(who: string, view: CalendarView, date: Date, hide = "") {
  return `${calendarBase(who, view, hide)}${toISODate(date)}`;
}

/** The same URL up to the date, for the controls that append their own. */
function calendarBase(who: string, view: CalendarView, hide = "") {
  return `/planner?seg=calendar&who=${who}&view=${view}&hide=${hide}&date=`;
}

async function CalendarPane({ familyId, meId, who, view, anchor, hidden, weekStart }: { familyId: string; meId: string; who: string; view: CalendarView; anchor: Date; hidden: Set<CalendarGroup>; weekStart: WeekStart }) {
  const hide = serializeHidden(hidden);
  const [members, sync] = await Promise.all([getMembers(familyId), getCalendarSyncStatus(familyId)]);
  const activeMembers = members.filter((m) => m.status !== "pending" && m.status !== "removed");
  // Your own entry says "Me": a filter naming you reads like someone else
  // looking at your house.
  const memberLabels = shortNames(activeMembers.map((m) => m.full_name)).map((l, i) => selfLabel(l, activeMembers[i].id === meId));
  const memberId = who === "all" ? undefined : who;

  // The title names the period, and stays on one line: the dates themselves
  // are on the rail below, so the week view needs the month, not a range.
  const label =
    view === "week"
      ? (() => {
          const start = startOfWeek(anchor, weekStart);
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          return start.getMonth() === end.getMonth()
            ? start.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
            : `${start.toLocaleDateString("en-GB", { month: "short" })} – ${end.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
        })()
      : view === "month"
        ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : String(anchor.getFullYear());

  return (
    // Keyed on what the server anchored: a new anchor starts the header off
    // naming that period again, rather than wherever it had been scrolled.
    <CalendarPeriod key={`${view}-${toISODate(anchor)}`} label={label} iso={toISODate(anchor)}>
      {/* The period, and the way to any other. */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
        {/* The title is the jump control: month, year or exact day in one tap. */}
        <CalendarJump label={label} hrefBase={calendarBase(who, view, hide)} anchor={toISODate(anchor)} weekStart={weekStart} />
        {/* Straight back to the current date. The prev/next arrows that used
            to sit here are gone: the week rail and the month scroller both
            scroll, and the title's sheet reaches any date at all, so the
            arrows only cost the title the room it needs to spell its month. */}
        <TodayButton hrefBase={calendarBase(who, view, hide)} />
      </div>

      {/* Whose, and which view. Each steps to the next on a tap and opens the
          whole list on its chevron or a long press — one button apiece, in
          place of a row of chips that grew with the family and a row of
          segments that never changed. */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.875rem" }}>
        <PickButton
          title="Who"
          icon="users"
          label={who === "all" ? "All" : (memberLabels[activeMembers.findIndex((m) => m.id === who)] ?? "All")}
          options={[
            { label: "Everyone", href: calendarHref("all", view, anchor, hide), active: who === "all" },
            ...activeMembers.map((m, i) => ({
              label: memberLabels[i],
              href: calendarHref(m.id, view, anchor, hide),
              active: who === m.id,
            })),
          ]}
        />
        <PickButton
          title="View"
          label={view[0].toUpperCase() + view.slice(1)}
          options={CALENDAR_VIEWS.map((v) => ({
            label: v[0].toUpperCase() + v.slice(1),
            href: calendarHref(who, v, anchor, hide),
            active: v === view,
          }))}
        />
      </div>

      {view === "week" && <WeekView familyId={familyId} memberId={memberId} who={who} anchor={anchor} hidden={hidden} hide={hide} weekStart={weekStart} />}
      {view === "month" && <MonthView familyId={familyId} memberId={memberId} who={who} anchor={anchor} hidden={hidden} hide={hide} weekStart={weekStart} />}
      {view === "year" && <YearView familyId={familyId} memberId={memberId} who={who} anchor={anchor} hidden={hidden} hide={hide} />}

      {/* The legend is also the filter: each entry says what a colour means
          and switches that category on or off. Off reads as a hollow dot on
          an outlined pill with the label dimmed, so the state never rests on
          colour alone. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem", margin: "16px 0 0", paddingTop: "0.75rem", borderTop: "1px solid var(--color-divider)" }}>
        {CALENDAR_LEGEND.map((l) => {
          const on = !hidden.has(l.group);
          return (
            <Link
              key={l.group}
              href={calendarHref(who, view, anchor, toggledHidden(hidden, l.group))}
              aria-label={`${on ? "Hide" : "Show"} ${l.label.toLowerCase()}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3125rem",
                minHeight: "2rem",
                padding: "0 0.8125rem",
                borderRadius: 999,
                fontSize: "0.8125rem",
                fontWeight: 500,
                textDecoration: "none",
                background: on ? "color-mix(in srgb, var(--color-text) 6%, transparent)" : "transparent",
                boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-divider)",
                // neutral-700, not 600: at this size 600 is 2.92:1 on the light page.
                color: on ? "var(--color-text)" : "var(--color-neutral-700)",
              }}
            >
              {/* The glyph, not just the dot: routines share the schedule
                  colour, so colour alone no longer separates the legend. */}
              <Icon name={l.icon} size={13} style={{ color: l.color, opacity: on ? 1 : 0.5, flex: "none" }} />
              {l.label}
            </Link>
          );
        })}
        {hidden.size > 0 && (
          <Link
            href={calendarHref(who, view, anchor)}
            style={{ minHeight: "2rem", display: "flex", alignItems: "center", padding: "0 0.5rem", fontSize: "0.8125rem", color: "var(--color-accent)", textDecoration: "none" }}
          >
            Show all
          </Link>
        )}
      </div>

      {/* Add anything the calendar can show, on the day being looked at. */}
      <AddToCalendar date={toISODate(anchor)} />

      {sync.connected > 0 && <CalendarSyncStatus lastSyncedISO={sync.lastSyncedAt?.toISOString() ?? null} />}

      <RememberFilter hide={hide} />
    </CalendarPeriod>
  );
}

/** One agenda row: a coloured rail and glyph for the category, the time, and
 * what it is. Colour groups; the glyph and title identify. */
function AgendaRow({ item }: { item: PlannerCalendarItem }) {
  const style = styleFor(item.table);
  const isPastActivity = item.table === "activities" && item.date < new Date();

  return (
    <div style={{ display: "flex", gap: "0.625rem", alignItems: "stretch", padding: "0.1875rem 0" }}>
      <span style={{ width: 4, borderRadius: 999, background: style.color, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0, padding: "0.4375rem 0" }}>
        <Link href={item.href} style={{ display: "flex", gap: "0.625rem", textDecoration: "none", color: "inherit", alignItems: "baseline" }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", width: "3.25rem", flex: "none" }}>
            {item.allDay ? "all-day" : familyClock(item.date)}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "1rem", fontWeight: 500, display: "block", lineHeight: 1.25 }}>{item.title}</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
              <Icon name={style.icon} size={12} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: "0.25rem" }} />
              {style.label}
              {item.location ? ` · ${item.location}` : ""}
              {item.who ? ` · ${item.who.toLowerCase()}` : ""}
            </span>
          </span>
        </Link>
        {isPastActivity && <AddToJournalButton activityId={item.id} />}
      </div>
    </div>
  );
}

/** Whether a date is wholly in the past — compared by day, so today never
 * counts as past however late it is. */
function isPast(date: Date, today: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return d < t;
}

/** "Nothing this week" and "nothing ever" deserve different words: the first
 * is a quiet week, the second is a calendar nobody has started. */
async function EmptyCalendar({ familyId, scope }: { familyId: string; scope: string }) {
  const hasAny = await hasAnyCalendarRecords(familyId);

  if (hasAny) {
    return <p style={{ fontSize: "0.9375rem", color: "var(--color-neutral-600)", padding: "1.125rem 0" }}>Nothing {scope}.</p>;
  }

  return (
    <Blueprint style={{ padding: "1.125rem", margin: "14px 0" }}>
      <div style={{ font: "600 1.125rem/1.2 var(--font-heading)", marginBottom: "0.375rem" }}>Your calendar starts here</div>
      <p style={{ fontSize: "0.90625rem", color: "var(--color-neutral-600)", margin: "0 0 12px", lineHeight: 1.45 }}>
        Everything the household has a date for gathers on this page — school runs and appointments, birthdays, trips,
        bills falling due, what is planned for dinner, and the dates you are saving towards. Add the first one and the
        rest of Kin will feed it as you go.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        {CALENDAR_LEGEND.map((l) => (
          <span key={l.group} style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </Blueprint>
  );
}

function DayHeading({ date, isToday }: { date: Date; isToday: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "14px 0 4px" }}>
      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: isToday ? "var(--color-accent)" : "var(--color-neutral-600)" }}>
        {isToday ? "Today" : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
    </div>
  );
}

async function WeekView({ familyId, memberId, who, anchor, hidden, hide, weekStart }: { familyId: string; memberId?: string; who: string; anchor: Date; hidden: Set<CalendarGroup>; hide: string; weekStart: WeekStart }) {
  const { days, strip } = await getWeekAgenda(familyId, memberId, anchor, hidden, undefined, weekStart);
  const selected = days.find((d) => d.isSelected);
  const today = new Date();

  return (
    <>
      {/* A rail of weeks, not a fixed seven days: it scrolls sideways through
          about two months, opens centred on the selected day, and any date on
          it can be tapped to select. */}
      <DateRail anchor={toISODate(anchor)}>
        {strip.map((d, i) => {
          const first = i === 0 || d.date.getDate() === 1;
          return (
            <Link
              key={i}
              href={calendarHref(who, "week", d.date, hide)}
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
                gap: "0.1875rem",
                padding: "0.25rem 0 0.3125rem",
                borderRadius: 12,
                background: d.isSelected && !d.isToday ? "color-mix(in srgb, var(--color-text) 7%, transparent)" : "transparent",
                opacity: isPast(d.date, today) ? 0.55 : 1,
              }}
            >
              {/* The label and the day number stop growing at what a seventh of a
                  phone can hold, so "Sept" and "25" never break at a large
                  text size. */}
              <span style={{ fontSize: "min(0.6875rem, 3vw)", color: "var(--color-neutral-600)", height: "0.8125rem" }}>
                {first ? d.date.toLocaleDateString("en-GB", { month: "short" }) : d.date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 1)}
              </span>
              <span
                style={{
                  width: "min(2.125rem, 11vw)",
                  height: "min(2.125rem, 11vw)",
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "min(1rem, 4.4vw)",
                  fontWeight: d.isToday || d.isSelected ? 600 : 400,
                  background: d.isToday ? "var(--color-accent)" : "transparent",
                  color: d.isToday ? "#fff" : "var(--color-text)",
                  boxShadow: d.isSelected && !d.isToday ? "inset 0 0 0 1.5px var(--color-accent)" : "none",
                }}
              >
                {d.date.getDate()}
              </span>
              <span style={{ display: "flex", gap: "0.125rem", height: 4 }}>
                {d.items.slice(0, 3).map((a) => (
                  <span key={`${a.table}-${a.id}`} style={{ width: 4, height: 4, borderRadius: 999, background: styleFor(a.table).color }} />
                ))}
              </span>
            </Link>
          );
        })}
      </DateRail>

      {/* The tapped day comes first and in full, then the rest of its week. */}
      {selected && (
        <div style={{ opacity: isPast(selected.date, today) ? 0.62 : 1 }}>
          <DayHeading date={selected.date} isToday={selected.isToday} />
          {selected.activities.length === 0 ? (
            <p style={{ fontSize: "0.9375rem", color: "var(--color-neutral-600)", padding: "0.375rem 0" }}>Nothing on this day.</p>
          ) : (
            selected.activities.map((a) => <AgendaRow key={`${a.table}-${a.id}`} item={a} />)
          )}
        </div>
      )}

      {days
        .filter((d) => !d.isSelected && d.activities.length > 0)
        .map((d) => (
          // Days already gone read a step back, so the eye lands on what is
          // still to come.
          <div key={d.date.toISOString()} style={{ opacity: isPast(d.date, today) ? 0.62 : 1 }}>
            <DayHeading date={d.date} isToday={d.isToday} />
            {d.activities.map((a) => (
              <AgendaRow key={`${a.table}-${a.id}`} item={a} />
            ))}
          </div>
        ))}
    </>
  );
}

async function MonthView({ familyId, memberId, who, anchor, hidden, hide, weekStart }: { familyId: string; memberId?: string; who: string; anchor: Date; hidden: Set<CalendarGroup>; hide: string; weekStart: WeekStart }) {
  const { months } = await getMonthsOverview(familyId, anchor, memberId, hidden);
  const today = new Date();
  const anchorMonth = months.find(
    (m) => m.monthStart.getFullYear() === anchor.getFullYear() && m.monthStart.getMonth() === anchor.getMonth(),
  );
  const selectedItems = anchorMonth?.itemsByDay[anchor.getDate()] ?? [];

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      {/* One weekday header for the whole run — the columns never move. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "0.125rem", marginBottom: "0.25rem" }}>
        {weekdayInitials(weekStart).map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: "0.6875rem", color: "var(--color-neutral-600)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Months run continuously: September scrolls straight into October
          rather than needing a Next tap, opened at the anchored month. */}
      <MonthScroller anchor={toISODate(anchor)}>
        {months.map((m) => {
          const isAnchorMonth = m === anchorMonth;
          const isThisMonth = m.monthStart.getFullYear() === today.getFullYear() && m.monthStart.getMonth() === today.getMonth();
          const monthLabel = m.monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
          // What the header should name, and jump to, once this month is the
          // one on screen — the same day of the month, where it exists.
          const monthIso = toISODate(new Date(m.monthStart.getFullYear(), m.monthStart.getMonth(), Math.min(anchor.getDate(), m.daysInMonth)));
          return (
            <div
              key={m.monthStart.toISOString()}
              data-anchor-month={isAnchorMonth}
              data-month-label={monthLabel}
              data-month-iso={monthIso}
              style={{ paddingBottom: "0.625rem" }}
            >
              <div
                style={{
                  font: "600 0.8125rem/1 var(--font-heading)",
                  letterSpacing: ".01em",
                  color: isThisMonth ? "var(--color-accent)" : "var(--color-neutral-600)",
                  padding: "0.625rem 0.125rem 0.375rem",
                }}
              >
                {monthLabel.toUpperCase()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "0.125rem" }}>
                {Array.from({ length: dayColumn(m.monthStart, weekStart) }, (_, i) => (
                  <div key={`b${i}`} />
                ))}
                {Array.from({ length: m.daysInMonth }, (_, i) => i + 1).map((day) => {
                  const date = new Date(m.monthStart.getFullYear(), m.monthStart.getMonth(), day);
                  const isToday = date.toDateString() === today.toDateString();
                  const isSelected = date.toDateString() === anchor.toDateString();
                  const items = m.itemsByDay[day] ?? [];
                  return (
                    <Link
                      key={day}
                      href={calendarHref(who, "month", date, hide)}
                      aria-current={isSelected ? "date" : undefined}
                      style={{
                        minHeight: "3.75rem",
                        minWidth: 0,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.125rem",
                        padding: "0.25rem 0.125rem",
                        borderRadius: 10,
                        background: isSelected && !isToday ? "color-mix(in srgb, var(--color-text) 7%, transparent)" : "transparent",
                        textDecoration: "none",
                        color: "inherit",
                        opacity: isPast(date, today) ? 0.55 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: "min(1.625rem, 11vw)",
                          height: "min(1.625rem, 11vw)",
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.875rem",
                          fontWeight: isToday || isSelected ? 600 : 400,
                          background: isToday ? "var(--color-accent)" : "transparent",
                          color: isToday ? "#fff" : "var(--color-text)",
                          boxShadow: isSelected && !isToday ? "inset 0 0 0 1.5px var(--color-accent)" : "none",
                        }}
                      >
                        {day}
                      </span>
                      {/* Chips carry a clipped title, so a day's contents read at a
                          glance rather than as an anonymous dot. A long title
                          must never widen its cell: the column is capped, the
                          chip is a block that cannot exceed it, and the text
                          clips inside. */}
                      <span style={{ width: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.0625rem" }}>
                        {items.slice(0, 2).map((a) => (
                          <span
                            key={`${a.table}-${a.id}`}
                            title={a.title}
                            style={{
                              display: "block",
                              maxWidth: "100%",
                              minWidth: 0,
                              fontSize: "0.53125rem",
                              lineHeight: 1.3,
                              borderRadius: 3,
                              padding: "0 0.125rem",
                              background: styleFor(a.table).color,
                              color: "#fff",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {a.title}
                          </span>
                        ))}
                        {items.length > 2 && (
                          <span style={{ fontSize: "0.53125rem", color: "var(--color-neutral-600)", textAlign: "center" }}>+{items.length - 2}</span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </MonthScroller>

      {/* The selected day's agenda stays put below the scroller. */}
      <div style={{ marginTop: "0.375rem" }}>
        <DayHeading date={anchor} isToday={anchor.toDateString() === today.toDateString()} />
        {selectedItems.length === 0 ? (
          months.every((m) => m.itemsByDay.every((d) => d.length === 0)) ? (
            <EmptyCalendar familyId={familyId} scope="on this day" />
          ) : (
            <p style={{ fontSize: "0.9375rem", color: "var(--color-neutral-600)", padding: "0.375rem 0" }}>Nothing on this day.</p>
          )
        ) : (
          selectedItems.map((a) => <AgendaRow key={`${a.table}-${a.id}`} item={a} />)
        )}
      </div>
    </div>
  );
}

async function YearView({ familyId, memberId, who, anchor, hidden, hide }: { familyId: string; memberId?: string; who: string; anchor: Date; hidden: Set<CalendarGroup>; hide: string }) {
  const { year, countsByMonth } = await getYearOverview(familyId, anchor, memberId, hidden);
  const today = new Date();
  const busiest = Math.max(1, ...countsByMonth);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
      {countsByMonth.map((count, i) => {
        const monthDate = new Date(year, i, 1);
        const isThisMonth = year === today.getFullYear() && i === today.getMonth();
        return (
          <Link key={i} href={calendarHref(who, "month", monthDate, hide)} style={{ textDecoration: "none", color: "inherit" }}>
            <Blueprint style={{ padding: "0.6875rem 0.625rem 0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: isThisMonth ? "var(--color-accent)" : "var(--color-text)" }}>
                {monthDate.toLocaleDateString("en-GB", { month: "short" })}
              </div>
              <div style={{ height: 4, borderRadius: 999, marginTop: "0.4375rem", background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${(count / busiest) * 100}%`, background: "var(--cal-schedule)" }} />
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>{count || "—"}</div>
            </Blueprint>
          </Link>
        );
      })}
    </div>
  );
}

/** What everyone has earned. Deliberately small and always present rather
 * than a page of its own: a scoreboard nobody passes is a scoreboard nobody
 * plays for, and one that needs opening is the same as not having one.
 *
 * Hidden entirely when nothing has ever been earned, so a household that
 * does not want points never has to look at a row of zeroes. */
function Scoreboard({ scores }: { scores: MemberScore[] }) {
  const worth = scores.filter((s) => s.points > 0 || s.awaiting > 0);
  if (worth.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem", marginBottom: "0.875rem" }}>
      {worth.map((s) => (
        <Blueprint key={s.id} style={{ padding: "0.5625rem 0.75rem", flex: "none", minWidth: 96 }}>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{s.name.split(" ")[0]}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.3125rem" }}>
            <span style={{ font: "600 1.375rem/1.1 var(--font-heading)", color: "var(--color-accent-700)" }}>{s.points}</span>
            <span style={{ fontSize: "0.71875rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>pts</span>
          </div>
          {s.awaiting > 0 && (
            <div style={{ fontSize: "0.71875rem", color: "var(--cal-money)", marginTop: "0.125rem" }}>
              {s.awaiting} waiting
            </div>
          )}
        </Blueprint>
      ))}
    </div>
  );
}

/** The one-off half of Tasks. Deliberately lighter than a recurring row:
 * there is no streak, no whose-turn and nothing to tick, because a one-off is
 * finished by happening rather than by being answered for. It is here so that
 * something added as a Task can be read back in the tab called Tasks, which
 * was not true of these until now. */
function OneOffTasks({ tasks }: { tasks: Awaited<ReturnType<typeof getOneOffTasks>> }) {
  if (tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.125rem" }}>
      <div style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
        One-off · {tasks.length}
      </div>
      {tasks.map((t) => {
        const start = new Date(t.start_at);
        const meta = ROUTINE_KIND_META[(t.kind as RoutineKind) ?? "other"] ?? ROUTINE_KIND_META.other;
        const whoFor = t.applies_to_whole_family ? "Whole family" : shortNames(t.who) || "House";

        return (
          <Link key={t.id} href={`/planner/add?type=task&id=${t.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.5625rem", display: "flex", gap: "0.6875rem", alignItems: "flex-start" }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--cal-schedule)",
                  color: "#fff",
                }}
              >
                <Icon name={meta.icon} size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "600 1.0625rem/1.2 var(--font-heading)" }}>{t.title}</div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                  {familyDateLong(start)} · {familyClock(start)}
                  {t.location ? ` · ${t.location}` : ""}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{whoFor}</div>
              </div>
              <Icon name="chevronLeft" size={15} style={{ transform: "rotate(180deg)", color: "var(--color-neutral-600)", flex: "none" }} />
            </Blueprint>
          </Link>
        );
      })}
    </div>
  );
}

async function RoutinesPane({ familyId, who, currency, justSaved }: { familyId: string; who: string; currency: string; justSaved: boolean }) {
  const memberId = who === "all" ? undefined : who;
  // Both kinds of task: the recurring ones, and the one-offs that used to be
  // called activities and could be read back nowhere but the calendar.
  const [routines, allOneOffs, scores, rewards, me] = await Promise.all([
    getRoutines(familyId, memberId),
    getOneOffTasks(familyId, `${familyDay()}T00:00:00.000Z`),
    getMemberScores(familyId),
    getRewards(familyId),
    getCurrentMember(),
  ]);
  const oneOffs = allOneOffs.filter((t) => concerns(t.memberIds, t.applies_to_whole_family, who));
  const dueToday = routines.filter((r) => !r.paused && r.today);

  return (
    <>
      {justSaved && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
            padding: "0.625rem 0.8125rem",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--color-switch-on) 16%, transparent)",
            fontSize: "0.875rem",
          }}
        >
          <Icon name="check" size={16} style={{ color: "var(--color-neutral-900)" }} />
          Task saved. It is on the calendar, and on the Google Calendar of everyone it is for.
        </div>
      )}

      <MemberChips familyId={familyId} seg="routines" who={who} />

      <Scoreboard scores={scores} />

      <RewardsShelf
        rewards={rewards}
        me={scores.find((s) => s.id === me?.id)}
        canManage={isGrownUp(me?.role ?? "")}
      />

      <OneOffTasks tasks={oneOffs} />

      {routines.length === 0 && oneOffs.length === 0 ? (
        <Blueprint style={{ padding: "1.125rem", marginBottom: "1rem" }}>
          <div style={{ font: "600 1.125rem/1.2 var(--font-heading)", marginBottom: "0.375rem" }}>The week&rsquo;s rhythm lives here</div>
          <p style={{ fontSize: "0.90625rem", color: "var(--color-neutral-600)", margin: 0, lineHeight: 1.45 }}>
            The grocery run, gym days, Sunday mass, swimming lessons — the things that come round again. Set one up once
            and it fills in the calendar from then on, reminds whoever it is for through their own phone calendar, and
            keeps track of whose turn it is.
          </p>
        </Blueprint>
      ) : (
        <>
          {dueToday.length > 0 && (
            <div style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
              Today · {dueToday.length}
            </div>
          )}
          {routines.map((r) => {
            const meta = ROUTINE_KIND_META[(r.kind as RoutineKind) ?? "other"] ?? ROUTINE_KIND_META.other;
            const whoFor = r.appliesToAll
              ? "Whole family"
              : r.rotates
                ? `Taking turns · ${r.members.map((m) => m.name.split(" ")[0]).join(", ")}`
                : r.members.map((m) => m.name.split(" ")[0]).join(", ") || "House";

            return (
              <Blueprint
                key={r.id}
                style={{
                  padding: "0.875rem",
                  marginBottom: "0.625rem",
                  opacity: r.paused ? 0.62 : 1,
                  // Behind gets an amber edge, settled-for-today a green one,
                  // so the state of each routine reads before it is read.
                  boxShadow:
                    !r.paused && r.overdue.length > 0
                      ? "inset 3px 0 0 var(--cal-money)"
                      : !r.paused && r.today?.status === "done"
                        ? "inset 3px 0 0 var(--color-switch-on)"
                        : undefined,
                }}
              >
                <div style={{ display: "flex", gap: "0.6875rem", alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      flex: "none",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--cal-schedule)",
                      color: "#fff",
                    }}
                  >
                    <Icon name={meta.icon} size={18} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "600 1.0625rem/1.2 var(--font-heading)" }}>{r.title}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                      {describeRule(r.rule, r.timeOfDay)}
                      {r.location ? ` · ${r.location}` : ""}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{whoFor}</div>
                  </div>
                  {!r.paused && r.today?.status === "done" && (
                    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
                      <Icon name="check" size={14} style={{ color: "var(--color-switch-on)" }} />
                      Done
                    </span>
                  )}
                  {r.streak > 1 && (
                    <span
                      style={{
                        flex: "none",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "0.1875rem 0.5625rem",
                        borderRadius: 999,
                        background: "color-mix(in srgb, var(--color-switch-on) 18%, transparent)",
                        color: "var(--color-neutral-900)",
                      }}
                      title={`${r.streak} in a row`}
                    >
                      {r.streak}×
                    </span>
                  )}
                </div>

                {!r.paused && (r.today || r.overdue.length > 0 || r.upcoming.length > 0) && (
                  <div style={{ marginTop: "0.6875rem", paddingTop: "0.6875rem", borderTop: "1px solid var(--color-divider)" }}>
                    {r.today && (
                      <>
                        {r.today.assignee && (
                          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.4375rem" }}>
                            Today it is {r.today.assignee.name.split(" ")[0]}&rsquo;s turn
                            {r.timeOfDay ? ` · ${formatTimeOfDay(r.timeOfDay)}` : ""}
                          </div>
                        )}
                        <RoutineTick
                          routineId={r.id}
                          date={r.today.date}
                          status={r.today.status}
                          cost={r.expectedCost}
                          currency={currency}
                        />
                      </>
                    )}
                    {/* Behind on, and a way to answer for any other day —
                        ahead of it, or afterwards against the day it happened. */}
                    <RoutineOccurrences
                      routineId={r.id}
                      overdue={r.overdue}
                      upcoming={r.upcoming}
                      cost={r.expectedCost}
                      currency={currency}
                    />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.5625rem", flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                    {r.paused
                      ? "Paused — off everyone&rsquo;s calendar until resumed"
                      : r.next
                        ? `Next ${r.next.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`
                        : "No more occurrences"}
                    {r.reminderMinutes != null && !r.paused ? ` · reminder ${r.reminderMinutes} min before` : ""}
                  </span>
                  <Link href={`/planner/routines/new?id=${r.id}`} className="btn btn-ghost" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}>
                    Edit
                  </Link>
                  <RoutinePauseButton id={r.id} paused={r.paused} />
                  <RoutineDeleteButton id={r.id} title={r.title} />
                </div>
              </Blueprint>
            );
          })}
        </>
      )}

      <Link href="/planner/routines/new" className="btn btn-primary btn-block" style={{ minHeight: "3rem", fontSize: "1rem", marginTop: "0.375rem" }}>
        <Icon name="plus" size={17} /> Add a task
      </Link>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem", lineHeight: 1.45 }}>
        Tasks show up in the calendar and on Today, and go to the Google Calendar of everyone they are for — so the
        reminder arrives on their phone, not just in Kin.
      </p>
    </>
  );
}

/** The member filter, shared by every Planner tab so choosing a person means
 * the same thing wherever you are and survives switching tab. */
async function MemberChips({ familyId, seg, who }: { familyId: string; seg: string; who: string }) {
  const [members, me] = await Promise.all([getMembers(familyId), getCurrentMember()]);
  const active = members.filter((m) => m.status !== "pending" && m.status !== "removed");
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === me?.id));

  return (
    <div style={{ display: "flex", marginBottom: "0.875rem" }}>
      <PickButton
        title="Who"
        icon="users"
        label={who === "all" ? "All" : (labels[active.findIndex((m) => m.id === who)] ?? "All")}
        options={[
          { label: "Everyone", href: `/planner?seg=${seg}&who=all`, active: who === "all" },
          ...active.map((m, i) => ({ label: labels[i], href: `/planner?seg=${seg}&who=${m.id}`, active: who === m.id })),
        ]}
      />
    </div>
  );
}

/** Whether a record concerns the person being filtered to. Whole-family
 * records always do — narrowing to one person should never hide the things
 * that person is part of. */
function concerns(memberIds: string[], appliesToAll: boolean, who: string): boolean {
  return who === "all" || appliesToAll || memberIds.includes(who);
}

/** Events and trips both live on this one segment now -- a household doesn't
 * think of a trip as a fundamentally different kind of thing from a
 * birthday, just a date-bearing plan with more attached to it (a budget, a
 * packing list, travellers). The nearest upcoming trip keeps its richer hero
 * card below, since that extra detail is exactly what's worth surfacing; every
 * other event and trip is one merged, date-ordered list beneath it. */
async function EventsPane({ familyId, memberId, currency, who }: { familyId: string; memberId: string; currency: string; who: string }) {
  const fmtDate = await familyDate();
  const [allEvents, accounts, members] = await Promise.all([getEvents(familyId), getAccounts(familyId), getMembers(familyId)]);
  // One query now: travel is a kind of event, not a second table. Which of
  // them gets the richer hero card is decided by the kind, not by where the
  // row came from.
  const visible = allEvents.filter((e) => concerns(e.memberIds, e.applies_to_whole_family, who));
  // Whose calendar entry is this? One member gets their colour; a whole-family
  // event or one naming several people gets none, because a stripe that means
  // "some of you" means nothing. The name is always on the row beside it, so
  // the colour is a second way of reading it rather than the only way.
  const colourOf = new Map(members.map((m) => [m.id, memberColourVar(m.id, m.color)]));
  const stripeFor = (e: { memberIds: string[]; applies_to_whole_family: boolean }): string | null =>
    e.applies_to_whole_family || e.memberIds.length !== 1 ? null : (colourOf.get(e.memberIds[0]) ?? null);
  const events = visible.filter((e) => e.kind !== "travel");
  const trips = visible.filter((e) => e.kind === "travel");
  const pickable = accounts
    .filter((a) => a.is_joint || a.owner_member_id === memberId)
    .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }));
  // The soonest trip that hasn't started yet -- not just whichever sorts
  // first, which used to surface a trip a year out over one next week, or a
  // trip already over, as the hero card.
  const today = familyDay(new Date());
  const upcomingTrip = trips
    .filter((t) => t.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
  const earlierTrips = trips.filter((t) => t.id !== upcomingTrip?.id);

  const rows: ({ date: string } & ({ kind: "event"; event: (typeof events)[number] } | { kind: "trip"; trip: (typeof earlierTrips)[number] }))[] = [
    ...events.map((e) => ({ kind: "event" as const, date: e.event_date, event: e })),
    ...earlierTrips.map((t) => ({ kind: "trip" as const, date: t.event_date, trip: t })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <MemberChips familyId={familyId} seg="events" who={who} />
      {upcomingTrip && (
        <Blueprint style={{ marginBottom: "1rem", padding: 0 }}>
          <div
            className={upcomingTrip.photoUrl ? "" : "duotone"}
            style={{
              height: 130,
              backgroundImage: upcomingTrip.photoUrl ? `url(${upcomingTrip.photoUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div style={{ padding: "0.8125rem" }}>
            <div style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>
              {fmtDate(upcomingTrip.event_date)}
              {upcomingTrip.end_date ? ` — ${fmtDate(upcomingTrip.end_date)}` : ""}
            </div>
            <div style={{ font: "600 1.5rem/1.05 var(--font-heading)", margin: "6px 0 8px" }}>{upcomingTrip.title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.8125rem" }}>
              <Fact k="Budget" v={upcomingTrip.budget_amount ? formatAccounting(Number(upcomingTrip.budget_amount), upcomingTrip.budget_currency ?? currency) : "—"} />
              <Fact k="Packed" v={`${upcomingTrip.packed_count} / ${upcomingTrip.packed_total}`} />
              <Fact
                k="Travelling"
                v={
                  upcomingTrip.applies_to_whole_family || upcomingTrip.who.length === 0
                    ? "Whole family"
                    : upcomingTrip.who.map((n) => n.split(" ")[0]).join(", ")
                }
              />
            </div>
            {upcomingTrip.invite_url && <InviteCard eventId={upcomingTrip.id} url={upcomingTrip.invite_url} />}
            <Link
              href={`/planner/add?type=event&id=${upcomingTrip.id}`}
              className="btn btn-secondary btn-block"
              style={{ minHeight: "2.5rem", fontSize: "0.8125rem", marginTop: "0.75rem" }}
            >
              Edit trip
            </Link>
            <div style={{ marginTop: "0.625rem" }}>
              <LogSpendControl
                accounts={pickable}
                currency={currency}
                particulars={`${upcomingTrip.title} · travel`}
                category="Travel"
                sourceTable="events"
                sourceId={upcomingTrip.id}
                label="Log trip spend"
              />
            </div>
          </div>
        </Blueprint>
      )}
      {rows.length === 0 && (
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>
          {allEvents.length === 0 ? "Nothing planned yet." : "Nothing planned for this person."}
        </p>
      )}
      {rows.map((row) =>
        row.kind === "event" ? (
          // Every row is the same shape, invitation or not (26 September): the
          // title itself is the link to the invitation, and the preview card
          // stays on the event's own screen, where there is room for it. The
          // whole row still opens the event -- a link stretched under the row,
          // which the title's own link sits above, since a link inside a link
          // is invalid.
          <div key={`event-${row.event.id}`} className="kin-planrow">
            <Link href={`/planner/add?type=event&id=${row.event.id}`} className="kin-planrow-hit" aria-label={`Open ${row.event.title}`} />
            <Blueprint
              style={{
                width: 50,
                height: 50,
                flex: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderLeft: stripeFor(row.event) ? `3px solid ${stripeFor(row.event)}` : undefined,
              }}
            >
              <span style={{ font: "600 1.125rem/1 var(--font-heading)" }}>{new Date(row.event.event_date).getDate()}</span>
              <span style={{ fontSize: "0.53125rem", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
                {new Date(row.event.event_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
              </span>
            </Blueprint>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlanTitle title={row.event.title} inviteUrl={row.event.invite_url} />
              <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {row.event.applies_to_whole_family || row.event.who.length === 0 ? "Whole family" : row.event.who.map((n) => n.split(" ")[0]).join(", ")}
                {row.event.sub_note ? ` · ${row.event.sub_note}` : ""}
              </div>
            </div>
            <Tag variant={row.event.kind === "birthday" || row.event.kind === "anniversary" ? "neutral" : "accent"} className="self-start">
              {row.event.kind.toUpperCase()}
            </Tag>
          </div>
        ) : (
          <div key={`trip-${row.trip.id}`} className="kin-planrow">
            <Link href={`/planner/add?type=event&id=${row.trip.id}`} className="kin-planrow-hit" aria-label={`Open ${row.trip.title}`} />
            <Blueprint style={{ width: 50, height: 50, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ font: "600 1.125rem/1 var(--font-heading)" }}>{new Date(row.trip.event_date).getDate()}</span>
              <span style={{ fontSize: "0.53125rem", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
                {new Date(row.trip.event_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
              </span>
            </Blueprint>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlanTitle title={row.trip.title} inviteUrl={row.trip.invite_url} />
              <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {row.trip.applies_to_whole_family || row.trip.who.length === 0 ? "Whole family" : row.trip.who.map((n) => n.split(" ")[0]).join(", ")}
              </div>
            </div>
            {row.trip.journal_entry_id ? (
              <Link href="/journal?view=list" className="btn btn-ghost kin-planrow-over" style={{ fontSize: "0.8125rem" }}>
                In journal
              </Link>
            ) : (
              <Tag variant="neutral" className="self-start">TRIP</Tag>
            )}
          </div>
        ),
      )}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <Link href="/planner/add?type=event" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>
          + ADD EVENT
        </Link>
        <Link href="/planner/add?type=trip" className="btn btn-primary btn-block" style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>
          + ADD TRAVEL
        </Link>
      </div>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.5rem" }}>
        Birthdays and anniversaries repeat yearly on their own.
      </div>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span style={{ display: "block", fontSize: "0.6875rem", letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{k}</span>
      {v}
    </div>
  );
}

/** A row's title: plain, or -- when the event has an invitation -- the link
 * to it, opening in a new tab. Same size and place either way, so rows with
 * and without an invitation line up. */
function PlanTitle({ title, inviteUrl }: { title: string; inviteUrl: string | null }) {
  const style = { font: "600 1.125rem/1.1 var(--font-heading)" } as const;
  if (!inviteUrl) return <div style={style}>{title}</div>;
  return (
    <a href={inviteUrl} target="_blank" rel="noopener noreferrer nofollow" className="kin-planrow-invite kin-planrow-over" style={style} aria-label={`${title}: open the invitation in a new tab`}>
      {title}
      <Icon name="external" size="0.8125rem" style={{ marginLeft: "0.3125rem", verticalAlign: "0.0625rem" }} />
    </a>
  );
}
