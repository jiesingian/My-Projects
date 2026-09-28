import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { GoalRing } from "@/components/goal-ring";
import { GoalDeleteButton, GoalLogButtons, GoalRewardAnswer } from "@/components/goal-controls";
import { getGoals, type GoalView } from "@/lib/queries/goals";
import { GOAL_KIND_META, PERIOD_NOW, goalNumber } from "@/lib/goals";
import { formatCurrency } from "@/lib/format";
import { memberColourVar } from "@/lib/member-colours";
import { getMembers } from "@/lib/queries/family";
import type { WeekStart } from "@/lib/week";

/** Planner → Goals. Each goal is a ring that fills itself from what Kin
 * already holds (water, steps, weight, a savings goal) or from a tap
 * (a gym session, a book), with an optional reward someone else says yes
 * to. The member filter is the same one the other tabs use. */
export async function GoalsPane({
  familyId,
  me,
  who,
  currency,
  weekStart,
  filter,
}: {
  familyId: string;
  me: { id: string; role: string };
  who: string;
  currency: string;
  weekStart: WeekStart;
  filter: React.ReactNode;
}) {
  const [goals, members] = await Promise.all([getGoals(familyId, me, weekStart), getMembers(familyId)]);
  const colourOf = new Map(members.map((m) => [m.id, memberColourVar(m.id, m.color)]));
  // A household goal concerns everyone, so it stays when narrowing to one
  // person -- the same rule as whole-family tasks and events.
  const visible = goals.filter((g) => who === "all" || g.ownerId === null || g.ownerId === who);

  return (
    <>
      {filter}
      {visible.length === 0 && (
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
          {goals.length === 0
            ? "No goals yet. Set one for yourself, for someone else or for the whole household — eight glasses a day, three gym sessions a week, a first ₱10,000 saved."
            : "No goals for this person."}
        </p>
      )}
      {visible.map((g, i) => (
        <GoalCard key={g.id} goal={g} index={i} meId={me.id} currency={currency} colour={g.ownerId ? (colourOf.get(g.ownerId) ?? null) : null} />
      ))}
      <Link href="/planner/goals/new" className="btn btn-secondary" style={{ width: "100%", gap: "0.375rem", marginTop: "0.25rem" }}>
        <Icon name="plus" size={17} /> Set a goal
      </Link>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem", lineHeight: 1.45 }}>
        A reward counts once a parent or another adult says yes to it — never the person it is for.
      </p>
    </>
  );
}

/** "1 session", "3 sessions". Only the units Kin names itself are made
 * singular; a custom unit is left as the person typed it. */
function unitFor(goal: GoalView, n: number): string {
  if (goal.kind === "custom") return goal.unit ?? "";
  const unit = GOAL_KIND_META[goal.kind].unit;
  return n === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
}

function caption(goal: GoalView, currency: string): string {
  if (goal.kind === "weight") {
    if (goal.noData) return `Target ${goalNumber(goal.target)} kg · no weight recorded yet`;
    const from = goal.start !== null ? `from ${goalNumber(goal.start)} ` : "";
    return `${goalNumber(goal.current)} kg now · ${from}to ${goalNumber(goal.target)} kg`;
  }
  if (goal.kind === "money") return `${formatCurrency(goal.current, currency)} of ${formatCurrency(goal.target, currency)} ${PERIOD_NOW[goal.period]}`;
  // The unit once, after the target: "9 of 12 books so far".
  const unit = unitFor(goal, goal.target);
  return `${goalNumber(goal.current)} of ${goalNumber(goal.target)}${unit ? ` ${unit}` : ""} ${PERIOD_NOW[goal.period]}`;
}

function GoalCard({ goal, index, meId, currency, colour }: { goal: GoalView; index: number; meId: string; currency: string; colour: string | null }) {
  const meta = GOAL_KIND_META[goal.kind];
  const whose = goal.ownerId === null ? "Whole household" : goal.ownerId === meId ? "You" : (goal.ownerName?.split(" ")[0] ?? "Someone");
  const pct = Math.round(goal.fraction * 100);
  const logs = meta.logged && !goal.savingsTitle;
  const ringColour = colour ?? "var(--color-accent-solid)";

  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.625rem" }}>
      <div style={{ display: "flex", gap: "0.875rem", alignItems: "center" }}>
        <GoalRing fraction={goal.fraction} index={index} colour={ringColour} label={`${goal.title}: ${pct}%`}>
          {goal.reached ? <Icon name="check" size={22} style={{ color: ringColour }} /> : `${pct}%`}
        </GoalRing>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
            <Icon name={meta.icon} size={13} />
            {meta.label} · {whose}
          </div>
          <div style={{ font: "600 1.0625rem/1.25 var(--font-heading)", marginTop: "0.125rem" }}>{goal.title}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "0.125rem" }}>{caption(goal, currency)}</div>
          {goal.savingsTitle && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>From “{goal.savingsTitle}” on Wealth</div>
          )}
          {goal.dueDate && <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>By {readableDate(goal.dueDate)}</div>}
        </div>
      </div>

      {goal.reward && <RewardLine goal={goal} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
        {logs ? (
          <GoalLogButtons goalId={goal.id} label={goal.kind === "gym" ? "Session" : goal.kind === "money" ? "Add" : "One more"} askAmount={goal.kind === "money"} />
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{meta.hint}</span>
        )}
        <GoalDeleteButton goalId={goal.id} title={goal.title} />
      </div>
    </Blueprint>
  );
}

function RewardLine({ goal }: { goal: GoalView }) {
  const r = goal.reward!;
  const status =
    r.status === "pending"
      ? "Waiting for a yes"
      : r.status === "refused"
        ? `Not this one${r.decidedBy ? ` · ${r.decidedBy.split(" ")[0]}` : ""}`
        : goal.reached
          ? "Earned"
          : `Approved${r.decidedBy ? ` by ${r.decidedBy.split(" ")[0]}` : ""}`;
  const tone = r.status === "refused" ? "var(--color-neutral-600)" : r.status === "approved" ? "var(--cal-goal)" : "var(--cal-money)";

  return (
    <div
      style={{
        marginTop: "0.6875rem",
        padding: "0.5625rem 0.6875rem",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--cal-goal) 10%, transparent)",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <Icon name="gift" size={15} style={{ color: "var(--cal-goal)", flex: "none", marginTop: "0.125rem" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, textDecoration: r.status === "refused" ? "line-through" : undefined }}>{r.title}</div>
          <div style={{ fontSize: "0.75rem", color: tone, fontWeight: 600, marginTop: "0.0625rem" }}>{status}</div>
        </div>
      </div>
      {r.canAnswer && <GoalRewardAnswer goalId={goal.id} />}
    </div>
  );
}

function readableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
