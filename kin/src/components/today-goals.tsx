import { GoalLog } from "@/components/goal-controls";
import { GameSteps } from "@/components/game-controls";
import { TodayGoalsPanel, type TodayGoalRow } from "@/components/today-goals-panel";
import type { GoalQuickAddHow } from "@/components/goal-controls";
import { ClaimLine, caption } from "@/app/(app)/planner/goals-pane";
import { GOAL_KIND_META, goalNumber, isEverydayGoal } from "@/lib/goals";
import { progressText, splitDone, startsOpen } from "@/lib/today-goals";
import type { GoalView } from "@/lib/queries/goals";

/** Today's goals (Jonathan, 13 October, item 3): the viewer's own and the
 * household's goals that move day to day. Since 20 October (Janine) a
 * collapsible section of compact rows -- icon, name, "5/8", a thin bar and
 * "+" -- with what a goal is worth and its full controls one tap away, and
 * the ones done today folded under "Done". Nothing to show: nothing at all,
 * not an empty heading. */
export function TodayGoals({ goals, meId, today, plus, currency, saved }: { goals: GoalView[]; meId: string; today: string; plus: boolean; currency: string; saved: string | undefined }) {
  const rows = goals.filter((g) => isEverydayGoal(g, meId));
  if (rows.length === 0) return null;
  const { open, done } = splitDone(rows);
  const toRow = (g: GoalView): TodayGoalRow => row(g, { meId, today, plus, currency });
  return <TodayGoalsPanel memberId={meId} open={startsOpen(saved, done.length, rows.length)} todo={open.map(toRow)} done={done.map(toRow)} />;
}

function row(g: GoalView, { meId, today, plus, currency }: { meId: string; today: string; plus: boolean; currency: string }): TodayGoalRow {
  const meta = GOAL_KIND_META[g.kind];
  const locked = meta.plus && !plus;
  const game = g.category !== null;
  // A goals-game steps goal (20261020150000): its bar has a 50% mark, and
  // its controls are the steps field and +500 / +1,000 of Planner → Game.
  const gameSteps = g.kind === "steps" && game && g.ownerId !== null;
  const how: GoalQuickAddHow = locked
    ? "open"
    : gameSteps
      ? "gameSteps"
      : g.kind === "water"
        ? "water"
        : g.kind === "gym" || g.kind === "custom"
          ? game
            ? "gameTap"
            : "tap"
          : "open";
  const worth = game && g.ownerId ? [g.xp > 0 ? `+${g.xp} XP` : "", g.points > 0 ? `+${g.points} coins` : ""].filter(Boolean).join(" · ") : "";

  return {
    id: g.id,
    title: g.title,
    icon: meta.icon,
    progress: g.kind === "weight" ? (g.noData ? "—" : `${goalNumber(g.current)} kg`) : progressText(g.current, g.target),
    fraction: g.fraction,
    mark: gameSteps ? 0.5 : undefined,
    reached: g.reached,
    how,
    details: (
      <>
        <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)" }}>
          {caption(g, currency)}
          {g.ownerId === null ? " · whole household" : ""}
        </div>
        {worth && (
          <div style={{ fontSize: "0.75rem", fontWeight: 600, marginTop: "0.25rem" }}>
            {gameSteps ? `${worth} · half at 50%, the rest at 100%` : `${worth} when done`}
          </div>
        )}
        {gameSteps && plus && <GameSteps goalId={g.id} title={g.title} />}
        {!g.savingsTitle && !gameSteps && (
          <div style={{ marginTop: "0.5rem" }}>
            <GoalLog
              goalId={g.id}
              mode={g.kind}
              today={today}
              autoToday={g.autoToday}
              manualToday={g.manualToday}
              locked={locked ? `Logging ${meta.label.toLowerCase()} is part of Kin Plus.` : null}
            />
          </div>
        )}
        {!gameSteps && g.period !== "total" && g.ownerId && (g.points > 0 || g.streak > 0 || g.claim || g.reached) && <ClaimLine goal={g} meId={meId} />}
      </>
    ),
  };
}
