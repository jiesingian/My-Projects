import Link from "next/link";
import { householdZone } from "@/lib/household-zone";
import { Icon } from "@/components/icons";
import { TodayTaskList } from "@/components/today-task-list";
import { RewardsShelf } from "@/components/rewards-shelf";
import { getRoutinesNeedingAttention, getMemberScores, getRewards } from "@/lib/queries/routines";
import { getComingUp, getTodayBriefing, type BriefItem } from "@/lib/queries/today";
import { SosButton } from "@/components/sos-button";
import { CheckInPrompt } from "@/components/check-in-prompt";
import { getMyPendingCheckIns } from "@/lib/queries/member-card";
import { LettersOpeningToday } from "@/components/letters-opening";
import { getAlkansya } from "@/lib/queries/alkansya";
import { formatCurrency } from "@/lib/format";
import { JARS, JAR_LABEL } from "@/lib/alkansya";
import { ArrivedButton } from "@/components/arrived-button";

/** Things a child in kid view should not be sent to: money, the household's
 * running, and anybody's health records. */
function forAChild(b: BriefItem): boolean {
  // Health items link to /family, so they are told apart by their icon.
  return b.tint !== "money" && b.icon !== "activity" && !/^\/(wealth|household)\b/.test(b.href) && !/view=health|seg=health|\/health\b/.test(b.href);
}

/** Today in kid view (K2, 25 September): their own jobs with big ticks, their
 * coins and what they can spend them on, and what is coming up -- nothing
 * about money or the running of the house. */
export async function KidToday({ me, arrivedNow = false }: { arrivedNow?: boolean; me: { id: string; role: string; family_id: string; full_name: string; families: { currency: string; name: string } } }) {
  const [tasks, scores, rewards, brief, comingUp, checkIns, alkansya] = await Promise.all([
    getRoutinesNeedingAttention(me.family_id, me.id),
    getMemberScores(me.family_id),
    getRewards(me.family_id),
    getTodayBriefing(me.family_id, me.families.currency, me),
    getComingUp(me.family_id, me.families.currency, me),
    getMyPendingCheckIns(me.id),
    getAlkansya(me.family_id, me.id),
  ]);
  const mine = scores.find((s) => s.id === me.id);
  const coins = mine?.spendable ?? 0;
  const first = me.full_name.split(" ")[0];
  // A child's coming-up is their own and the family's, not the grown-ups'.
  const next = [...brief, ...comingUp.filter((b) => b.whose !== "others")].filter(forAChild).slice(0, 6);
  const day = new Date().toLocaleDateString("en-GB", { weekday: "long", timeZone: await householdZone() }).toUpperCase();

  return (
    <div className="kin-kid" style={{ padding: "1.25rem var(--gutter) 1.375rem" }}>
      {/* A child in kid view has SOS too (30 September): it alerts the
          household's grown-ups, which is who a child would want. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3125rem" }}>
        <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)" }}>{day}</div>
        <SosButton householdName={me.families.name} />
      </div>
      <h2 style={{ fontSize: "min(2.25rem, 12vw)", margin: "0 0 0.5rem" }}>Hi {first}!</h2>
      <CheckInPrompt checkIns={checkIns} />
      {/* "Nakarating na ako": at school, at Lola's -- one tap tells home. */}
      <ArrivedButton auto={arrivedNow} big />
      {/* A letter written to them years ago, on the day it opens. */}
      <LettersOpeningToday familyId={me.family_id} />
      <Link href="/planner?seg=goals&g=shop" className="kin-kid-stars">
        <span aria-hidden="true">🪙</span> {coins} coin{coins === 1 ? "" : "s"}
        <span className="kin-kid-stars-go">Rewards ›</span>
      </Link>
      {/* Their own notes: only they can read them, not a parent. */}
      <Link href="/notes" className="btn btn-secondary" style={{ width: "100%", marginTop: "0.75rem", gap: "0.5rem" }}>
        <Icon name="fileText" size={16} /> My notes
      </Link>

      {/* Their own alkansya (20261019100000), once a grown-up has set one
          up: cash kept at home, in the three jars. */}
      {alkansya && (alkansya.plan || alkansya.balances.total > 0) && (
        <Link href={`/planner/alkansya/${me.id}`} className="blueprint" style={{ display: "block", padding: "0.75rem 0.875rem", marginTop: "0.75rem", textDecoration: "none", color: "inherit" }}>
          <span style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontWeight: 600 }}>My alkansya</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontWeight: 600 }}>{formatCurrency(alkansya.balances.total, me.families.currency)}</span>
          </span>
          <span style={{ display: "flex", gap: "0.75rem", fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
            {JARS.map((j) => (
              <span key={j}>
                {JAR_LABEL[j].name} {formatCurrency(alkansya.balances[j], me.families.currency)}
              </span>
            ))}
          </span>
        </Link>
      )}

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
