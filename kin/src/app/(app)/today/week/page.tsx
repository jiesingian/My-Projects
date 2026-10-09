import { householdZone } from "@/lib/household-zone";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { WeekRecapCard } from "@/components/memories";
import { GoalRing } from "@/components/goal-ring";
import { Icon } from "@/components/icons";
import { styleFor } from "@/lib/calendar-style";
import { familyClock } from "@/lib/time";
import { getWeeklyDigest } from "@/lib/queries/digest";

/** The family's week (approved 30 September): a Sunday look back at the
 * photos, the journal, the chores kept up and the goals, then the week
 * coming. Opened from "Your family's week" on Today. What each person sees
 * is theirs to see -- see queries/digest. */
export default async function WeekDigestPage() {
  const tz = await householdZone();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const d = await getWeeklyDigest(me);
  const nothingYet = d.photos.length + d.highlights.length + d.streaks.length + d.goals.length === 0;

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="Today" />
      <div className="kin-digest">
        <WeekRecapCard recap={d.recap} />

        {nothingYet && <p className="kin-digest-quiet">A quiet week. Photos, journal entries and chores ticked off will gather here.</p>}

        {d.photos.length > 0 && (
          <section>
            <h3 className="kin-eyebrow">Photos</h3>
            <div className="kin-digest-photos">
              {d.photos.map((p) => (
                <Link key={p.id} href="/journal?view=household" className="kin-digest-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs; see queries/journal */}
                  <img src={p.url} alt="" loading="lazy" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {d.highlights.length > 0 && (
          <section>
            <h3 className="kin-eyebrow">From the journal</h3>
            <ul className="kin-digest-list">
              {d.highlights.map((h) => (
                <li key={h.id}>
                  <Link href={`/journal/${h.id}`}>
                    {h.milestone && <span aria-label="Milestone">★ </span>}
                    {h.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.streaks.length > 0 && (
          <section>
            <h3 className="kin-eyebrow">Kept up</h3>
            <ul className="kin-digest-list">
              {d.streaks.map((s) => (
                <li key={s.id}>
                  <Icon name="repeat" size={14} /> {s.who}: {s.title} <span className="kin-digest-meta">· {s.days} days running</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {d.goals.length > 0 && (
          <section>
            <h3 className="kin-eyebrow">Goals</h3>
            <div className="kin-digest-goals">
              {d.goals.map((g, i) => (
                <Link key={g.id} href="/planner?seg=goals" className="kin-digest-goal">
                  <GoalRing fraction={g.fraction} size={48} stroke={6} index={i} label={`${g.title}: ${Math.round(g.fraction * 100)}%`}>
                    <span className="kin-digest-pct">{g.reached ? "✓" : `${Math.round(g.fraction * 100)}%`}</span>
                  </GoalRing>
                  <span>{g.title}{g.ownerName ? <span className="kin-digest-meta"> · {g.ownerName.split(" ")[0]}</span> : null}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="kin-eyebrow">Next week</h3>
          {d.nextWeek.length === 0 ? (
            <p className="kin-digest-quiet">Nothing planned yet.</p>
          ) : (
            d.nextWeek.map((day) => (
              <div key={day.date.toISOString()} className="kin-digest-day">
                <div className="kin-digest-dayname">{day.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</div>
                <ul className="kin-digest-list">
                  {day.items.map((it) => (
                    <li key={`${it.table}-${it.id}`}>
                      <span className="kin-digest-dot" style={{ background: styleFor(it.table).color }} aria-hidden="true" />
                      <Link href={it.href}>{it.title}</Link>
                      <span className="kin-digest-meta"> · {it.allDay ? styleFor(it.table).label.toLowerCase() : familyClock(it.date, tz)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
