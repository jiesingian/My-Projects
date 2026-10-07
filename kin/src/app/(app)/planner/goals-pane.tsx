import Link from "next/link";
import { householdZone } from "@/lib/household-zone";
import { FAMILY_FILTER } from "@/lib/queries/planner";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { GoalRing } from "@/components/goal-ring";
import { GoalChangeAnswer, GoalDeleteButton, GoalLogButtons, GoalRewardAnswer, GoalRewardClaim, GoalRewardConfirm, GoalRewardGiven, GoalRewardWithdraw } from "@/components/goal-controls";
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
  justAsked = false,
}: {
  familyId: string;
  me: { id: string; role: string };
  who: string;
  currency: string;
  weekStart: WeekStart;
  filter: React.ReactNode;
  /** Back from an edit that went to the giver rather than applying. */
  justAsked?: boolean;
}) {
  const [goals, members] = await Promise.all([getGoals(familyId, me, weekStart), getMembers(familyId)]);
  const colourOf = new Map(members.map((m) => [m.id, memberColourVar(m.id, m.color)]));
  // A household goal concerns everyone, so it stays when narrowing to one
  // person -- the same rule as whole-family tasks and events.
  // "Family" is the household goals alone (FAMILY_FILTER).
  const visible = goals.filter((g) => who === "all" || g.ownerId === null || (who !== FAMILY_FILTER && g.ownerId === who));

  return (
    <>
      {filter}
      {justAsked && (
        <p role="status" style={{ fontSize: "0.84375rem", lineHeight: 1.45, margin: "0 0 0.75rem", padding: "0.625rem 0.75rem", borderRadius: 12, background: "color-mix(in srgb, var(--cal-goal) 12%, transparent)" }}>
          Sent for a yes. This goal has a reward, so the change waits for whoever gives it — they can agree or keep it as it was.
        </p>
      )}
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
        A reward is a promise, so the person who gives it says yes — a parent, another adult or a child. Once promised it is binding: a day to give it after the goal is reached, then reminders every 5 minutes until it’s confirmed. Changing a goal with a reward needs the other side’s yes.
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

      {goal.reward && <RewardLine goal={goal} meId={meId} />}
      {goal.change && <ChangeLine goal={goal} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
        {logs ? (
          <GoalLogButtons goalId={goal.id} label={goal.kind === "gym" ? "Session" : goal.kind === "money" ? "Add" : "One more"} askAmount={goal.kind === "money"} />
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{meta.hint}</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          <Link href={`/planner/goals/${goal.id}/edit`} className="btn btn-ghost" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", color: "var(--color-neutral-700)" }}>
            Edit
          </Link>
          <GoalDeleteButton goalId={goal.id} title={goal.title} />
        </span>
      </div>
    </Blueprint>
  );
}

async function RewardLine({ goal, meId }: { goal: GoalView; meId: string }) {
  const tz = await householdZone();
  const r = goal.reward!;
  const giver = r.giverId === meId ? "you" : (r.giverName?.split(" ")[0] ?? "someone");
  const Giver = giver === "you" ? "You" : giver;
  const due = r.dueAt ? dueText(r.dueAt, tz) : "";
  const status =
    r.status === "pending"
      ? `Asked of ${giver} · waiting for a yes`
      : r.status === "refused"
        ? `${Giver} said not this one`
        : r.status === "approved"
          ? goal.reached
            ? `Reached · claim it and ${giver === "you" ? "your" : `${giver}'s`} day to give it starts`
            : `${Giver} promised`
          : r.status === "claimed"
            ? r.overdue
              ? `Overdue · ${giver === "you" ? "you owe it" : `${giver} owes it`} · Kin is reminding ${giver === "you" ? "you" : "them"} every 5 minutes`
              : `Claimed · ${giver === "you" ? "give it" : `${giver} gives it`} ${due}`
            : r.status === "given"
              ? r.overdue
                ? `Marked given · not confirmed, so the reminders are back on`
                : `Marked given by ${giver} · waiting for a confirm`
              : `Received · given by ${giver}`;
  const tone =
    r.status === "refused" || r.status === "received"
      ? "var(--color-neutral-600)"
      : r.overdue
        ? "var(--cal-occasion)"
        : r.status === "approved"
          ? "var(--cal-goal)"
          : "var(--cal-money)";
  // Asked-only: whoever asked or the giver may take it back. Once promised,
  // only the one receiving it may let it go.
  const mayWithdraw = r.status === "pending" ? r.proposedById === meId || r.viewerGives : r.viewerReceives && r.status !== "received" && r.status !== "refused";

  return (
    <div
      style={{
        marginTop: "0.6875rem",
        padding: "0.5625rem 0.6875rem",
        borderRadius: 12,
        background: r.overdue ? "color-mix(in srgb, var(--cal-occasion) 12%, transparent)" : "color-mix(in srgb, var(--cal-goal) 10%, transparent)",
      }}
    >
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <Icon name="gift" size={15} style={{ color: "var(--cal-goal)", flex: "none", marginTop: "0.125rem" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, textDecoration: r.status === "refused" ? "line-through" : undefined }}>{r.title}</div>
          <div style={{ fontSize: "0.75rem", color: tone, fontWeight: 600, marginTop: "0.0625rem" }}>{status}</div>
        </div>
        {mayWithdraw && <GoalRewardWithdraw goalId={goal.id} />}
      </div>
      {r.viewerGives && r.status === "pending" && <GoalRewardAnswer goalId={goal.id} />}
      {r.viewerReceives && r.status === "approved" && goal.reached && <GoalRewardClaim goalId={goal.id} />}
      {r.viewerGives && r.status === "claimed" && <GoalRewardGiven goalId={goal.id} />}
      {r.viewerReceives && r.status === "given" && <GoalRewardConfirm goalId={goal.id} />}
    </div>
  );
}

/** "by 3:40 pm tomorrow", in the household's time. */
function dueText(iso: string, tz: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: tz }).toLowerCase();
  const day = d.toLocaleDateString("en-CA", { timeZone: tz });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  return `by ${time}${day === today ? " today" : " tomorrow"}`;
}

function ChangeLine({ goal }: { goal: GoalView }) {
  const c = goal.change!;
  const who = c.viewerAsked ? "You asked" : `${c.proposedBy?.split(" ")[0] ?? "Someone"} asks`;
  const giver = goal.reward && (goal.reward.status === "pending" || goal.reward.status === "approved") ? goal.reward : null;
  const waitingOn = c.canAnswer ? "" : giver ? ` · waiting for ${giver.giverName?.split(" ")[0] ?? "the giver"}` : "";
  return (
    <div style={{ marginTop: "0.5625rem", padding: "0.5625rem 0.6875rem", borderRadius: 12, border: "1px dashed color-mix(in srgb, var(--color-text) 18%, transparent)" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", fontWeight: 600 }}>
        {who} to change it{waitingOn}
      </div>
      {c.lines.map((l) => (
        <div key={l} style={{ fontSize: "0.8125rem", marginTop: "0.125rem" }}>
          {l}
        </div>
      ))}
      {(c.canAnswer || c.viewerAsked) && <GoalChangeAnswer changeId={c.id} canAnswer={c.canAnswer} viewerAsked={c.viewerAsked} />}
    </div>
  );
}

function readableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
