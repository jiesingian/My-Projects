import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getWeekAgenda, getEvents, getGoals, getTrips } from "@/lib/queries/planner";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { AddToJournalButton } from "@/components/add-to-journal-button";

const SEGMENTS = ["calendar", "events", "goals", "travel"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "calendar";

  const segments = SEGMENTS.map((s) => ({
    label: s[0].toUpperCase() + s.slice(1),
    href: `/planner?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="03" title="Planner" segments={segments} />
      <div style={{ padding: "0 22px 22px" }}>
        {seg === "calendar" && <CalendarPane familyId={me.family_id} />}
        {seg === "events" && <EventsPane familyId={me.family_id} />}
        {seg === "goals" && <GoalsPane familyId={me.family_id} currency={me.families.currency} />}
        {seg === "travel" && <TravelPane familyId={me.family_id} currency={me.families.currency} />}
      </div>
    </div>
  );
}

async function CalendarPane({ familyId }: { familyId: string }) {
  const { days, today } = await getWeekAgenda(familyId);
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
            <div style={{ fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase", opacity: 0.75 }}>
              {d.date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}
            </div>
            <div style={{ font: "600 17px/1.1 var(--font-heading)" }}>{d.date.getDate()}</div>
            <div style={{ fontSize: 8, fontFamily: "ui-monospace, Menlo, monospace", opacity: 0.8 }}>{d.count || ""}</div>
          </div>
        ))}
      </div>
      <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 4 }}>
        TODAY
      </div>
      <div style={{ borderTop: "1px solid var(--color-text)" }}>
        {today.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)", padding: "12px 0" }}>Nothing scheduled today.</p>}
        {today.map((a) => {
          const isPast = new Date(a.start_at) < new Date();
          return (
            <div key={a.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ font: "400 11px/1.4 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)", width: 44, flex: "none" }}>
                  {new Date(a.start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: "600 17px/1.15 var(--font-heading)", display: "block" }}>{a.title}</span>
                  <span style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{a.location ?? ""}</span>
                </span>
                <Tag variant="neutral">{a.who}</Tag>
              </div>
              {isPast && <AddToJournalButton activityId={a.id} />}
            </div>
          );
        })}
      </div>
      <Link href="/planner/add?type=activity" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD ACTIVITY
      </Link>
    </>
  );
}

async function EventsPane({ familyId }: { familyId: string }) {
  const events = await getEvents(familyId);
  return (
    <>
      {events.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No events yet.</p>}
      {events.map((e) => (
        <div key={e.id} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <Blueprint style={{ width: 50, height: 50, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ font: "600 18px/1 var(--font-heading)" }}>{new Date(e.event_date).getDate()}</span>
            <span style={{ fontSize: 8.5, letterSpacing: ".1em", color: "var(--color-neutral-600)" }}>
              {new Date(e.event_date).toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
            </span>
          </Blueprint>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 18px/1.1 var(--font-heading)" }}>{e.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>{e.sub_note}</div>
          </div>
          <Tag variant={e.kind === "birthday" || e.kind === "anniversary" ? "neutral" : "accent"} className="self-start">
            {e.kind.toUpperCase()}
          </Tag>
        </div>
      ))}
      <Link href="/planner/add?type=event" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD EVENT
      </Link>
      <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 8 }}>
        Birthdays and anniversaries repeat yearly on their own.
      </div>
    </>
  );
}

async function GoalsPane({ familyId, currency }: { familyId: string; currency: string }) {
  const goals = await getGoals(familyId);
  return (
    <>
      {goals.length === 0 && <p style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>No goals yet.</p>}
      {goals.map((g) => {
        const pct = g.target_amount ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;
        return (
          <Blueprint key={g.id} style={{ padding: 13, marginBottom: 13 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ font: "600 18px/1.05 var(--font-heading)" }}>{g.title}</span>
              <Tag variant={g.is_joint ? "accent" : "neutral"} className="ml-auto">
                {g.is_joint ? "JOINT" : (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase() ?? "MINE"}
              </Tag>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{g.sub_note}</div>
            <div style={{ height: 8, border: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
            </div>
            <div style={{ display: "flex", fontSize: 10.5, color: "var(--color-neutral-600)", marginTop: 5 }}>
              <span>
                {g.target_unit
                  ? `${g.current_amount} of ${g.target_amount} ${g.target_unit}`
                  : `${formatCurrency(Number(g.current_amount), currency)} of ${formatCurrency(Number(g.target_amount ?? 0), currency)}`}
              </span>
              <span style={{ marginLeft: "auto" }}>{pct}%</span>
            </div>
          </Blueprint>
        );
      })}
      <Link href="/planner/add?type=goal" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 16 }}>
        + ADD GOAL
      </Link>
    </>
  );
}

async function TravelPane({ familyId, currency }: { familyId: string; currency: string }) {
  const trips = await getTrips(familyId);
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
            <div style={{ font: "400 9.5px/1 ui-monospace, Menlo, monospace", color: "var(--color-accent-700)" }}>
              {formatDate(upcoming.start_date)}
              {upcoming.end_date ? ` — ${formatDate(upcoming.end_date)}` : ""}
            </div>
            <div style={{ font: "600 24px/1.05 var(--font-heading)", margin: "6px 0 8px" }}>{upcoming.title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11.5 }}>
              <Fact k="Budget" v={upcoming.budget_amount ? formatCurrency(Number(upcoming.budget_amount), currency) : "—"} />
              <Fact k="Packed" v={`${upcoming.packed_count} / ${upcoming.packed_total}`} />
              <Fact k="Travelling" v={upcoming.travellers.length ? upcoming.travellers.map((n) => n.split(" ")[0]).join(", ") : "All"} />
            </div>
          </div>
        </Blueprint>
      ) : (
        <p style={{ fontSize: 12, color: "var(--color-neutral-600)", marginBottom: 16 }}>No trips planned yet.</p>
      )}
      <Link href="/planner/add?type=trip" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", margin: "0 0 20px" }}>
        + ADD TRAVEL
      </Link>
      {earlier.length > 0 && (
        <>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".16em", color: "var(--color-neutral-600)", marginBottom: 6 }}>
            EARLIER
          </div>
          {earlier.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 12, padding: "11px 0", borderTop: "1px solid var(--color-divider)" }}>
              <span style={{ font: "400 10.5px/1.4 ui-monospace, Menlo, monospace", color: "var(--color-neutral-600)", width: 84, flex: "none" }}>
                {formatDate(t.start_date)}
              </span>
              <span style={{ flex: 1, font: "600 17px/1.1 var(--font-heading)" }}>{t.title}</span>
              {t.journal_entry_id && (
                <Link href="/journal?seg=entries" className="btn btn-ghost" style={{ fontSize: 11.5 }}>
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
      <span style={{ display: "block", fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{k}</span>
      {v}
    </div>
  );
}
