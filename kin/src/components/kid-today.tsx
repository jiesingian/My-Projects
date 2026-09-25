import Link from "next/link";
import { Icon } from "@/components/icons";
import { TodayTaskList } from "@/components/today-task-list";
import { RewardsShelf } from "@/components/rewards-shelf";
import { getRoutinesNeedingAttention, getMemberScores, getRewards } from "@/lib/queries/routines";
import { getComingUp, getTodayBriefing, type BriefItem } from "@/lib/queries/today";

/** Things a child in kid view should not be sent to: money, the household's
 * running, and anybody's health records. */
function forAChild(b: BriefItem): boolean {
  // Health items link to /family, so they are told apart by their icon.
  return b.tint !== "money" && b.icon !== "activity" && !/^\/(wealth|household)\b/.test(b.href) && !/view=health|seg=health|\/health\b/.test(b.href);
}

/** Today in kid view (K2, 25 September): their own jobs with big ticks, their
 * stars and what they can spend them on, and what is coming up -- nothing
 * about money or the running of the house. */
export async function KidToday({ me }: { me: { id: string; family_id: string; full_name: string; families: { currency: string } } }) {
  const [tasks, scores, rewards, brief, comingUp] = await Promise.all([
    getRoutinesNeedingAttention(me.family_id, me.id),
    getMemberScores(me.family_id),
    getRewards(me.family_id),
    getTodayBriefing(me.family_id, me.families.currency),
    getComingUp(me.family_id, me.families.currency),
  ]);
  const mine = scores.find((s) => s.id === me.id);
  const stars = mine?.spendable ?? 0;
  const first = me.full_name.split(" ")[0];
  const next = [...brief, ...comingUp].filter(forAChild).slice(0, 6);
  const day = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: "Asia/Manila" }).toUpperCase();

  return (
    <div className="kin-kid" style={{ padding: "1.25rem 1.375rem 1.375rem" }}>
      <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>{day}</div>
      <h2 style={{ fontSize: "min(2.25rem, 12vw)", margin: "0 0 0.5rem" }}>Hi {first}!</h2>
      <Link href="/planner?seg=routines" className="kin-kid-stars">
        <span aria-hidden="true">⭐</span> {stars} star{stars === 1 ? "" : "s"}
        <span className="kin-kid-stars-go">Rewards ›</span>
      </Link>

      <div style={{ marginTop: "1.5rem" }}>
        {tasks.length === 0 ? (
          <>
            <h3 className="kin-eyebrow">Today&rsquo;s tasks</h3>
            <p style={{ fontSize: "1rem", color: "var(--color-neutral-600)", margin: "0 0 1.25rem" }}>Nothing to do today. Nice!</p>
          </>
        ) : (
          <div className="kin-kid-jobs">
            <TodayTaskList tasks={tasks} />
          </div>
        )}
      </div>

      <RewardsShelf rewards={rewards} me={mine} canManage={false} />

      {next.length > 0 && (
        <section style={{ marginBottom: "1.625rem" }}>
          <h3 className="kin-eyebrow">Coming up</h3>
          <div className="kin-brief">
            {next.map((b) => (
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
    </div>
  );
}
