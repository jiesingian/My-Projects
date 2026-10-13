import Link from "next/link";
import { GoalRing } from "@/components/goal-ring";
import { GoalLog } from "@/components/goal-controls";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { ClaimLine, caption } from "@/app/(app)/planner/goals-pane";
import { GOAL_KIND_META, isEverydayGoal } from "@/lib/goals";
import type { GoalView } from "@/lib/queries/goals";

/** Today's goals (Jonathan, 13 October, item 3): the viewer's own and the
 * household's goals that move day to day, each with its ring and the same
 * hand entry as on Planner -- a glass, the day's steps, a session, Undo --
 * and the claim once it is met. Not yet met first. Nothing to show: nothing
 * at all, not an empty heading. */
export function TodayGoals({ goals, meId, today, plus, currency }: { goals: GoalView[]; meId: string; today: string; plus: boolean; currency: string }) {
  const rows = goals
    .filter((g) => isEverydayGoal(g, meId))
    .sort((a, b) => Number(a.reached) - Number(b.reached) || a.title.localeCompare(b.title));
  if (rows.length === 0) return null;

  return (
    <section id="goals" style={{ marginBottom: "1.625rem" }}>
      <h3 className="kin-eyebrow" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span>Today’s goals</span>
        <Link href="/planner?seg=goals" style={{ fontSize: "0.75rem", textTransform: "none", letterSpacing: 0, color: "var(--color-accent-700)", fontWeight: 500 }}>
          All goals
        </Link>
      </h3>
      {rows.map((g, i) => {
        const meta = GOAL_KIND_META[g.kind];
        const pct = Math.round(g.fraction * 100);
        return (
          <Blueprint key={g.id} style={{ padding: "0.75rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <GoalRing fraction={g.fraction} index={i} size={46} stroke={5} label={`${g.title}: ${pct}%`}>
                {g.reached ? <Icon name="check" size={17} style={{ color: "var(--color-accent-solid)" }} /> : <span style={{ fontSize: "0.6875rem" }}>{pct}%</span>}
              </GoalRing>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.6875rem", color: "var(--color-neutral-600)" }}>
                  <Icon name={meta.icon} size={12} />
                  {meta.label}
                  {g.ownerId === null ? " · Whole household" : ""}
                </div>
                <div style={{ font: "600 0.96875rem/1.25 var(--font-heading)" }}>{g.title}</div>
                <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>{caption(g, currency)}</div>
              </div>
            </div>
            {!g.savingsTitle && (
              <div style={{ marginTop: "0.5rem" }}>
                <GoalLog
                  goalId={g.id}
                  mode={g.kind}
                  today={today}
                  autoToday={g.autoToday}
                  manualToday={g.manualToday}
                  locked={meta.plus && !plus ? `Logging ${meta.label.toLowerCase()} is part of Kin Plus.` : null}
                />
              </div>
            )}
            {g.period !== "total" && g.ownerId && (g.points > 0 || g.streak > 0 || g.claim || g.reached) && <ClaimLine goal={g} meId={meId} />}
          </Blueprint>
        );
      })}
    </section>
  );
}
