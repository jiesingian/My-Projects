import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getWeekAgenda, getMonthOverview, getYearOverview, getEvents, getTrips, type PlannerCalendarItem } from "@/lib/queries/planner";
import { getMembers } from "@/lib/queries/family";
import { getAccounts } from "@/lib/queries/wealth";
import { syncGoogleCalendarIfStale } from "@/lib/actions/calendar-sync";
import { HubHeader } from "@/components/hub-header";
import { ChipRow } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { AddToJournalButton } from "@/components/add-to-journal-button";
import { Icon } from "@/components/icons";
import { CALENDAR_LEGEND, styleFor } from "@/lib/calendar-style";
import { LogSpendControl } from "@/components/money-actions";

const SEGMENTS = ["calendar", "events", "travel"] as const;
type Seg = (typeof SEGMENTS)[number];
const CALENDAR_VIEWS = ["week", "month", "year"] as const;
type CalendarView = (typeof CALENDAR_VIEWS)[number];

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; who?: string; view?: string; date?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "calendar";
  const who = sp.who ?? "all";
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as CalendarView) : "week";
  const anchor = sp.date ? new Date(`${sp.date}T00:00:00`) : new Date();

  await syncGoogleCalendarIfStale(me.family_id, 5 * 60 * 1000);

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/planner?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="03" title="Planner" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "calendar" && <CalendarPane familyId={me.family_id} who={who} view={view} anchor={anchor} />}
        {seg === "events" && <EventsPane familyId={me.family_id} />}
        {seg === "travel" && <TravelPane familyId={me.family_id} memberId={me.id} currency={me.families.currency} />}
      </div>
    </div>
  );
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftAnchor(date: Date, view: CalendarView, dir: 1 | -1): Date {
  const d = new Date(date);
  if (view === "week") d.setDate(d.getDate() + 7 * dir);
  else if (view === "month") d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}

function calendarHref(who: string, view: CalendarView, date: Date) {
  return `/planner?seg=calendar&who=${who}&view=${view}&date=${toISODate(date)}`;
}

async function CalendarPane({ familyId, who, view, anchor }: { familyId: string; who: string; view: CalendarView; anchor: Date }) {
  const members = await getMembers(familyId);
  const activeMembers = members.filter((m) => m.status !== "pending" && m.status !== "removed");
  const memberId = who === "all" ? undefined : who;

  const label =
    view === "week"
      ? (() => {
          const start = new Date(anchor);
          start.setDate(anchor.getDate() - anchor.getDay());
          const end = new Date(start);
          end.setDate(start.getDate() + 6);
          const sameMonth = start.getMonth() === end.getMonth();
          const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: sameMonth ? undefined : "short" });
          const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          return `${startLabel} – ${endLabel}`;
        })()
      : view === "month"
        ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : String(anchor.getFullYear());

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <ChipRow
          items={[
            { label: "All", href: calendarHref("all", view, anchor), active: who === "all" },
            ...activeMembers.map((m) => ({
              label: m.full_name.split(" ")[0],
              href: calendarHref(m.id, view, anchor),
              active: who === m.id,
            })),
          ]}
        />
      </div>

      <div className="seg" style={{ marginBottom: 12, marginTop: 0 }}>
        {CALENDAR_VIEWS.map((v) => (
          <Link key={v} href={calendarHref(who, v, anchor)} data-active={view === v}>
            {v[0].toUpperCase() + v.slice(1)}
          </Link>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
        <span style={{ flex: 1, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{label}</span>
        <Link href={calendarHref(who, view, new Date())} className="btn btn-secondary" style={{ minHeight: 34, fontSize: 13, padding: "0 12px" }}>
          Today
        </Link>
        <Link
          href={calendarHref(who, view, shiftAnchor(anchor, view, -1))}
          className="btn btn-secondary btn-icon"
          aria-label="Previous"
          style={{ width: 34, height: 34 }}
        >
          <Icon name="chevronLeft" size={16} />
        </Link>
        <Link
          href={calendarHref(who, view, shiftAnchor(anchor, view, 1))}
          className="btn btn-secondary btn-icon"
          aria-label="Next"
          style={{ width: 34, height: 34 }}
        >
          <Icon name="chevronLeft" size={16} style={{ transform: "rotate(180deg)" }} />
        </Link>
      </div>

      {view === "week" && <WeekView familyId={familyId} memberId={memberId} who={who} anchor={anchor} />}
      {view === "month" && <MonthView familyId={familyId} memberId={memberId} who={who} anchor={anchor} />}
      {view === "year" && <YearView familyId={familyId} memberId={memberId} who={who} anchor={anchor} />}

      {/* What each colour means — colour alone never has to carry it. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", margin: "18px 0 0", paddingTop: 14, borderTop: "1px solid var(--color-divider)" }}>
        {CALENDAR_LEGEND.map((l) => (
          <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-neutral-600)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      <Link href="/planner/add?type=activity" className="btn btn-primary btn-block" style={{ minHeight: 48, fontSize: 16, marginTop: 16 }}>
        <Icon name="plus" size={17} /> Add to calendar
      </Link>
    </>
  );
}

/** One agenda row: a coloured rail and glyph for the category, the time, and
 * what it is. Colour groups; the glyph and title identify. */
function AgendaRow({ item }: { item: PlannerCalendarItem }) {
  const style = styleFor(item.table);
  const isPastActivity = item.table === "activities" && item.date < new Date();

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch", padding: "3px 0" }}>
      <span style={{ width: 4, borderRadius: 999, background: style.color, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0, padding: "7px 0" }}>
        <Link href={item.href} style={{ display: "flex", gap: 10, textDecoration: "none", color: "inherit", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, color: "var(--color-neutral-600)", width: 52, flex: "none" }}>
            {item.allDay ? "all-day" : item.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 500, display: "block", lineHeight: 1.25 }}>{item.title}</span>
            <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>
              <Icon name={style.icon} size={12} style={{ display: "inline-block", verticalAlign: "-1px", marginRight: 4 }} />
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

function DayHeading({ date, isToday }: { date: Date; isToday: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 4px" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? "var(--color-accent)" : "var(--color-neutral-600)" }}>
        {isToday ? "Today" : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
    </div>
  );
}

async function WeekView({ familyId, memberId, who, anchor }: { familyId: string; memberId?: string; who: string; anchor: Date }) {
  const { days } = await getWeekAgenda(familyId, memberId, anchor);

  return (
    <>
      {/* Date bubbles rather than boxed tiles — today reads as a filled circle. */}
      <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>
        {days.map((d, i) => (
          <Link
            key={i}
            href={calendarHref(who, "week", d.date)}
            style={{ flex: 1, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "4px 0" }}
          >
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
              {d.date.toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 1)}
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
                fontWeight: d.isToday ? 600 : 400,
                background: d.isToday ? "var(--color-accent)" : "transparent",
                color: d.isToday ? "#fff" : "var(--color-text)",
              }}
            >
              {d.date.getDate()}
            </span>
            <span style={{ display: "flex", gap: 2, height: 4 }}>
              {d.activities.slice(0, 3).map((a) => (
                <span key={`${a.table}-${a.id}`} style={{ width: 4, height: 4, borderRadius: 999, background: styleFor(a.table).color }} />
              ))}
            </span>
          </Link>
        ))}
      </div>

      {days.every((d) => d.activities.length === 0) && (
        <p style={{ fontSize: 15, color: "var(--color-neutral-600)", padding: "18px 0" }}>Nothing scheduled this week.</p>
      )}

      {days
        .filter((d) => d.activities.length > 0)
        .map((d) => (
          <div key={d.date.toISOString()}>
            <DayHeading date={d.date} isToday={d.isToday} />
            {d.activities.map((a) => (
              <AgendaRow key={`${a.table}-${a.id}`} item={a} />
            ))}
          </div>
        ))}
    </>
  );
}

async function MonthView({ familyId, memberId, who, anchor }: { familyId: string; memberId?: string; who: string; anchor: Date }) {
  const { monthStart, daysInMonth, itemsByDay } = await getMonthOverview(familyId, anchor, memberId);
  const leadingBlanks = monthStart.getDay();
  const today = new Date();
  // The anchored day's agenda opens under the grid, so tapping a date reads
  // it in place instead of navigating away to the week.
  const selected = anchor.getMonth() === monthStart.getMonth() ? anchor.getDate() : null;
  const selectedItems = selected ? itemsByDay[selected] ?? [] : [];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-600)" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
          const isToday = date.toDateString() === today.toDateString();
          const isSelected = day === selected;
          const items = itemsByDay[day] ?? [];
          return (
            <Link
              key={day}
              href={calendarHref(who, "month", date)}
              style={{
                minHeight: 62,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "4px 2px",
                borderRadius: 10,
                background: isSelected && !isToday ? "color-mix(in srgb, var(--color-text) 6%, transparent)" : "transparent",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: isToday ? 600 : 400,
                  background: isToday ? "var(--color-accent)" : "transparent",
                  color: isToday ? "#fff" : "var(--color-text)",
                }}
              >
                {day}
              </span>
              {/* Chips carry a clipped title, so a day's contents read at a
                  glance rather than as an anonymous dot. */}
              <span style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
                {items.slice(0, 2).map((a) => (
                  <span
                    key={`${a.table}-${a.id}`}
                    style={{
                      fontSize: 8.5,
                      lineHeight: 1.3,
                      borderRadius: 3,
                      padding: "0 2px",
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
                  <span style={{ fontSize: 8.5, color: "var(--color-neutral-600)", textAlign: "center" }}>+{items.length - 2}</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      {selected && (
        <div style={{ marginTop: 10 }}>
          <DayHeading date={anchor} isToday={anchor.toDateString() === today.toDateString()} />
          {selectedItems.length === 0 ? (
            <p style={{ fontSize: 15, color: "var(--color-neutral-600)", padding: "6px 0" }}>Nothing on this day.</p>
          ) : (
            selectedItems.map((a) => <AgendaRow key={`${a.table}-${a.id}`} item={a} />)
          )}
        </div>
      )}
    </div>
  );
}

async function YearView({ familyId, memberId, who, anchor }: { familyId: string; memberId?: string; who: string; anchor: Date }) {
  const { year, countsByMonth } = await getYearOverview(familyId, anchor, memberId);
  const today = new Date();
  const busiest = Math.max(1, ...countsByMonth);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
      {countsByMonth.map((count, i) => {
        const monthDate = new Date(year, i, 1);
        const isThisMonth = year === today.getFullYear() && i === today.getMonth();
        return (
          <Link key={i} href={calendarHref(who, "month", monthDate)} style={{ textDecoration: "none", color: "inherit" }}>
            <Blueprint style={{ padding: "11px 10px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: isThisMonth ? "var(--color-accent)" : "var(--color-text)" }}>
                {monthDate.toLocaleDateString("en-GB", { month: "short" })}
              </div>
              <div style={{ height: 4, borderRadius: 999, marginTop: 7, background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <div style={{ height: "100%", borderRadius: 999, width: `${(count / busiest) * 100}%`, background: "var(--cal-schedule)" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--color-neutral-600)", marginTop: 5 }}>{count || "—"}</div>
            </Blueprint>
          </Link>
        );
      })}
    </div>
  );
}

async function EventsPane({ familyId }: { familyId: string }) {
  const events = await getEvents(familyId);
  return (
    <>
      {events.length === 0 && <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>No events yet.</p>}
      {events.map((e) => (
        <Link
          key={e.id}
          href={`/planner/add?type=event&id=${e.id}`}
          style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", textDecoration: "none", color: "inherit" }}
        >
          <Blueprint style={{ width: 50, height: 50, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ font: "600 18px/1 var(--font-heading)" }}>{new Date(e.event_date).getDate()}</span>
            <span style={{ fontSize: 8.5, letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
              {new Date(e.event_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
            </span>
          </Blueprint>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 18px/1.1 var(--font-heading)" }}>{e.title}</div>
            <div style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{e.sub_note}</div>
          </div>
          <Tag variant={e.kind === "birthday" || e.kind === "anniversary" ? "neutral" : "accent"} className="self-start">
            {e.kind.toUpperCase()}
          </Tag>
        </Link>
      ))}
      <Link href="/planner/add?type=event" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD EVENT
      </Link>
      <div style={{ fontSize: 13, color: "var(--color-neutral-600)", marginTop: 8 }}>
        Birthdays and anniversaries repeat yearly on their own.
      </div>
    </>
  );
}

async function TravelPane({ familyId, memberId, currency }: { familyId: string; memberId: string; currency: string }) {
  const [trips, accounts] = await Promise.all([getTrips(familyId), getAccounts(familyId)]);
  const pickable = accounts
    .filter((a) => a.is_joint || a.owner_member_id === memberId)
    .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }));
  const [upcoming, ...earlier] = trips;
  return (
    <>
      {upcoming ? (
        <Blueprint style={{ marginBottom: 16, padding: 0 }}>
          <div
            className={upcoming.photoUrl ? "" : "duotone"}
            style={{
              height: 130,
              backgroundImage: upcoming.photoUrl ? `url(${upcoming.photoUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div style={{ padding: 13 }}>
            <div style={{ font: "400 12px/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>
              {formatDate(upcoming.start_date)}
              {upcoming.end_date ? ` — ${formatDate(upcoming.end_date)}` : ""}
            </div>
            <div style={{ font: "600 24px/1.05 var(--font-heading)", margin: "6px 0 8px" }}>{upcoming.title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 13 }}>
              <Fact k="Budget" v={upcoming.budget_amount ? formatCurrency(Number(upcoming.budget_amount), currency) : "—"} />
              <Fact k="Packed" v={`${upcoming.packed_count} / ${upcoming.packed_total}`} />
              <Fact k="Travelling" v={upcoming.travellers.length ? upcoming.travellers.map((n) => n.split(" ")[0]).join(", ") : "All"} />
            </div>
            <div style={{ marginTop: 12 }}>
              <LogSpendControl
                accounts={pickable}
                currency={currency}
                particulars={`${upcoming.title} · travel`}
                category="Travel"
                sourceTable="trips"
                sourceId={upcoming.id}
                label="LOG TRIP SPEND"
              />
            </div>
          </div>
        </Blueprint>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)", marginBottom: 16 }}>No trips planned yet.</p>
      )}
      <Link href="/planner/add?type=trip" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", margin: "0 0 20px" }}>
        + ADD TRAVEL
      </Link>
      {earlier.length > 0 && (
        <>
          <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", marginBottom: 6 }}>
            EARLIER
          </div>
          {earlier.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderTop: "1px solid var(--color-divider)" }}>
              <span style={{ font: "400 10.5px/1.4 var(--font-numeric)", color: "var(--color-neutral-600)", width: 84, flex: "none" }}>
                {formatDate(t.start_date)}
              </span>
              <span style={{ flex: 1, font: "600 17px/1.1 var(--font-heading)" }}>{t.title}</span>
              {t.journal_entry_id && (
                <Link href="/journal?seg=entries" className="btn btn-ghost" style={{ fontSize: 13 }}>
                  In journal
                </Link>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span style={{ display: "block", fontSize: 11, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{k}</span>
      {v}
    </div>
  );
}
