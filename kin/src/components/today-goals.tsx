import { GoalLog } from "@/components/goal-controls";
import { GameSteps, GameTap, GameWalkLog } from "@/components/game-controls";
import { TodayGoalsPanel, type TodayGoalGroup, type TodayGoalRow } from "@/components/today-goals-panel";
import type { GoalQuickAddHow } from "@/components/goal-controls";
import { ClaimLine, caption } from "@/app/(app)/planner/goals-pane";
import { GOAL_KIND_META, goalNumber, isEverydayGoal } from "@/lib/goals";
import { asksToday, childGoals, progressText, splitDone, startsOpen } from "@/lib/today-goals";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import type { GoalView } from "@/lib/queries/goals";

/** Today's goals (Jonathan, 13 October, item 3): the viewer's own and the
 * household's goals that move day to day. Since 20 October (Janine) a
 * collapsible section of compact rows -- icon, name, "5/8", a thin bar and
 * "+" -- with what a goal is worth and its full controls one tap away, and
 * the ones done today folded under "Done".
 *
 * A grown-up also sees, under each child's name, the game goals of the
 * children with no login of their own (20261020190000): their "+" is the
 * grown-up's tick -- a baby's goal credits the grown-up, a young child's
 * stays hers. A goal linked to others (the family's stroller walk) logs them
 * all at once, with the walk's steps. A busy day's backup goal sits on its
 * own line, outside the count. A goal asked only on some weekdays is not
 * here on the others. Nothing to show: nothing at all, not an empty
 * heading. */
export async function TodayGoals({ goals, me, today, plus, currency, saved }: { goals: GoalView[]; me: { id: string; role: string; family_id: string }; today: string; plus: boolean; currency: string; saved: string | undefined }) {
  const grownUp = isGrownUp(me.role);
  const supabase = await createClient();
  const [{ data: children }, { data: links }] = await Promise.all([
    grownUp
      ? supabase.from("members").select("id, full_name").eq("family_id", me.family_id).eq("role", "child_managed").not("status", "in", "(pending,removed)").order("created_at")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase.from("planner_goal_links").select("goal_id, linked_goal_id").eq("family_id", me.family_id),
  ]);

  const mine = goals.filter((g) => isEverydayGoal(g, me.id) && asksToday(g, today));
  const rows = mine.filter((g) => !g.backup);
  const backups = mine.filter((g) => g.backup);
  const groups = childGoals(goals, children ?? [], today);
  if (rows.length === 0 && backups.length === 0 && groups.length === 0) return null;

  const titleOf = new Map(goals.map((g) => [g.id, g.ownerName ? `${g.ownerName.split(" ")[0]} · ${g.title}` : g.title]));
  const linkedTo = (goalId: string) => (links ?? []).filter((l) => l.goal_id === goalId).map((l) => titleOf.get(l.linked_goal_id)).filter((t): t is string => !!t);
  const ctx = { meId: me.id, today, plus, currency, linkedTo };
  const toRow = (g: GoalView): TodayGoalRow => row(g, ctx);

  const { open, done } = splitDone(rows);
  const childGroups: TodayGoalGroup[] = groups.map(({ child, goals: gs }) => {
    const split = splitDone(gs);
    return { id: child.id, name: child.full_name.split(" ")[0], todo: split.open.map(toRow), done: split.done.map(toRow) };
  });
  return (
    <TodayGoalsPanel
      memberId={me.id}
      open={startsOpen(saved, done.length, rows.length)}
      todo={open.map(toRow)}
      done={done.map(toRow)}
      groups={childGroups}
      backups={backups.map(toRow)}
    />
  );
}

function row(g: GoalView, { meId, today, plus, currency, linkedTo }: { meId: string; today: string; plus: boolean; currency: string; linkedTo: (id: string) => string[] }): TodayGoalRow {
  const meta = GOAL_KIND_META[g.kind];
  const locked = meta.plus && !plus;
  const game = g.category !== null;
  // A goals-game steps goal (20261020150000): its bar has a 50% mark, and
  // its controls are the steps field and +500 / +1,000 of Planner → Game.
  const gameSteps = g.kind === "steps" && game && g.ownerId !== null;
  const gameTap = game && (g.kind === "custom" || g.kind === "gym");
  const links = gameTap ? linkedTo(g.id) : [];
  const how: GoalQuickAddHow = locked
    ? "open"
    : links.length > 0
      ? "open"
      : gameSteps
        ? "gameSteps"
        : g.kind === "water"
          ? "water"
          : gameTap
            ? "gameTap"
            : g.kind === "gym" || g.kind === "custom"
              ? "tap"
              : "open";
  const credit = g.creditTo === "logger" && g.ownerId !== meId ? "yours, for ticking it" : "";
  const worth = game && g.ownerId ? [g.xp > 0 ? `+${g.xp} XP` : "", g.points > 0 ? `+${g.points} coins` : ""].filter(Boolean).join(" · ") : "";

  return {
    id: g.id,
    title: g.title,
    icon: meta.icon,
    emoji: g.emoji,
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
        {g.backup && <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>On a busy day this keeps your streak going. No bonus.</div>}
        {worth && (
          <div style={{ fontSize: "0.75rem", fontWeight: 600, marginTop: "0.25rem" }}>
            {gameSteps ? `${worth} · half at 50%, the rest at 100%` : credit ? `${worth} when done · ${credit}` : `${worth} when done`}
          </div>
        )}
        {links.length > 0 && <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>Also counts for: {links.join(", ")}</div>}
        {gameSteps && plus && <GameSteps goalId={g.id} title={g.title} />}
        {links.length > 0 && <GameWalkLog goalId={g.id} title={g.title} plus={plus} />}
        {gameTap && links.length === 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <GameTap goalId={g.id} title={g.title} canUndo={g.current > 0} />
          </div>
        )}
        {!g.savingsTitle && !gameSteps && !gameTap && (
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
        {!game && g.period !== "total" && g.ownerId && (g.points > 0 || g.streak > 0 || g.claim || g.reached) && <ClaimLine goal={g} meId={meId} />}
      </>
    ),
  };
}
