import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getWeekAgenda, getMonthOverview, getYearOverview, getEvents, getTrips } from "@/lib/queries/planner";
import { getMembers } from "@/lib/queries/family";
import { getAccounts } from "@/lib/queries/wealth";
import { syncGoogleCalendarIfStale } from "@/lib/actions/calendar-sync";
import { HubHeader } from "@/components/hub-header";
import { ChipRow } from "@/components/segmented";
import { Blueprint, Tag } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { AddToJournalButton } from "@/components/add-to-journal-button";
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Link href={calendarHref(who, view, shiftAnchor(anchor, view, -1))} className="btn btn-secondary" aria-label="Previous" style={{ minHeight: 34, minWidth: 34, fontSize: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ‹
        </Link>
        <span style={{ flex: 1, textAlign: "center", font: "600 14px/1 var(--font-heading)" }}>{label}</span>
        <Link href={calendarHref(who, view, shiftAnchor(anchor, view, 1))} className="btn btn-secondary" aria-label="Next" style={{ minHeight: 34, minWidth: 34, fontSize: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          ›
        </Link>
        <Link href={calendarHref(who, view, new Date())} className="btn btn-secondary" style={{ minHeight: 34, fontSize: 13, padding: "0 10px" }}>
          TODAY
        </Link>
      </div>

      {view === "week" && <WeekView familyId={familyId} memberId={memberId} anchor={anchor} />}
      {view === "month" && <MonthView familyId={familyId} memberId={memberId} who={who} anchor={anchor} />}
      {view === "year" && <YearView familyId={familyId} memberId={memberId} who={who} anchor={anchor} />}

      <Link href="/planner/add?type=activity" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD ACTIVITY
      </Link>
    </>
  );
}

async function WeekView({ familyId, memberId, anchor }: { familyId: string; memberId?: string; anchor: Date }) {
  const { days } = await getWeekAgenda(familyId, memberId, anchor);

  return (
    <>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {days.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              border: `1px solid ${d.isToday ? "var(--color-accent)" : "var(--color-divider)"}`,
              background: d.isToday ? "var(--color-accent)" : "transparent",
              color: d.isToday ? "var(--color-bg)" : "var(--color-text)",
              padding: "7px 0",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 8.5, letterSpacing: ".02em", textTransform: "uppercase", opacity: 0.75 }}>
              {d.date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
            </div>
            <div style={{ font: "600 17px/1.1 var(--font-heading)" }}>{d.date.getDate()}</div>
            <div style={{ fontSize: 8, fontFamily: "var(--font-numeric)", opacity: 0.8 }}>{d.activities.length || ""}</div>
          </div>
        ))}
      </div>
      {days.every((d) => d.activities.length === 0) && (
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)", padding: "12px 0" }}>Nothing scheduled this week.</p>
      )}
      {days
        .filter((d) => d.activities.length > 0)
        .map((d) => (
        <div key={d.date.toISOString()} style={{ marginBottom: 10 }}>
          <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: d.isToday ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "10px 0 4px" }}>
            {d.isToday ? "TODAY" : d.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }).toUpperCase()}
          </div>
          <div style={{ borderTop: "1px solid var(--color-divider)" }}>
            {d.activities.map((a) => {
              const isPastActivity = a.table === "activities" && a.date < new Date();
              return (
                <div key={`${a.table}-${a.id}`} style={{ padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                  <Link href={a.href} style={{ display: "flex", gap: 12, textDecoration: "none", color: "inherit" }}>
                    <span style={{ font: "400 13px/1.4 var(--font-numeric)", color: "var(--color-accent-700)", width: 50, flex: "none" }}>
                      {a.allDay ? "ALL DAY" : a.date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ font: "600 17px/1.15 var(--font-heading)", display: "block" }}>{a.title}</span>
                      <span style={{ fontSize: 13, color: "var(--color-neutral-600)" }}>{a.location ?? ""}</span>
                    </span>
                    <Tag variant="neutral">{a.who}</Tag>
                  </Link>
                  {isPastActivity && <AddToJournalButton activityId={a.id} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

async function MonthView({ familyId, memberId, who, anchor }: { familyId: string; memberId?: string; who: string; anchor: Date }) {
  const { monthStart, daysInMonth, countsByDay } = await getMonthOverview(familyId, anchor, memberId);
  const leadingBlanks = monthStart.getDay();
  const today = new Date();

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
          const isToday = date.toDateString() === today.toDateString();
          const count = countsByDay[day] ?? 0;
          return (
            <Link
              key={day}
              href={calendarHref(who, "week", date)}
              style={{
                aspectRatio: "1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid ${isToday ? "var(--color-accent)" : "var(--color-divider)"}`,
                background: isToday ? "var(--color-accent)" : "transparent",
                color: isToday ? "var(--color-bg)" : "var(--color-text)",
                textDecoration: "none",
                fontSize: 13.5,
              }}
            >
              <span style={{ font: "600 13px/1 var(--font-heading)" }}>{day}</span>
              {count > 0 && (
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: isToday ? "var(--color-bg)" : "var(--color-accent)", marginTop: 2 }} />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function YearView({ familyId, memberId, who, anchor }: { familyId: string; memberId?: string; who: string; anchor: Date }) {
  const { year, countsByMonth } = await getYearOverview(familyId, anchor, memberId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
      {countsByMonth.map((count, i) => {
        const monthDate = new Date(year, i, 1);
        return (
          <Link key={i} href={calendarHref(who, "month", monthDate)} style={{ textDecoration: "none", color: "inherit" }}>
            <Blueprint style={{ padding: 10, textAlign: "center" }}>
              <div style={{ font: "600 13px/1.1 var(--font-heading)" }}>{monthDate.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}</div>
              <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: 3 }}>{count ? `${count} planned` : "—"}</div>
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
