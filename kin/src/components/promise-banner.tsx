import Link from "next/link";
import { Icon } from "@/components/icons";
import { GoalRewardConfirm, GoalRewardGiven } from "@/components/goal-controls";
import type { RewardDuty } from "@/lib/queries/goals";

/** A promised reward that is due or waiting for a word, at the top of Today.
 *
 * It has no close button on purpose (Jonathan, 28 September): it goes away
 * only when the promise is settled -- the giver marks it given, and the one
 * receiving it confirms. That is the in-app half of the chase; the other half
 * is the five-minute push from due_goal_reward_reminders(). */
export function PromiseBanner({ duties }: { duties: RewardDuty[] }) {
  if (duties.length === 0) return null;
  return (
    <section aria-label="Promises" style={{ marginBottom: "1.125rem", display: "grid", gap: "0.5rem" }}>
      {duties.map((d) => (
        <div
          key={`${d.kind}-${d.goalId}`}
          role={d.overdue ? "alert" : "status"}
          style={{
            padding: "0.75rem 0.8125rem",
            borderRadius: 14,
            background: d.overdue ? "color-mix(in srgb, var(--cal-occasion) 16%, var(--color-surface, transparent))" : "color-mix(in srgb, var(--cal-goal) 14%, var(--color-surface, transparent))",
            border: `1px solid ${d.overdue ? "color-mix(in srgb, var(--cal-occasion) 45%, transparent)" : "color-mix(in srgb, var(--cal-goal) 35%, transparent)"}`,
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <Icon name="gift" size={17} style={{ color: d.overdue ? "var(--cal-occasion)" : "var(--cal-goal)", flex: "none", marginTop: "0.125rem" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 0.96875rem/1.25 var(--font-heading)" }}>{headline(d)}</div>
              <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-700)", marginTop: "0.1875rem", lineHeight: 1.4 }}>
                {detail(d)}{" "}
                <Link href="/planner?seg=goals" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                  See the goal
                </Link>
              </div>
            </div>
          </div>
          {d.kind === "owe" && d.state === "claimed" && <GoalRewardGiven goalId={d.goalId} />}
          {d.kind === "confirm" && <GoalRewardConfirm goalId={d.goalId} />}
        </div>
      ))}
    </section>
  );
}

function headline(d: RewardDuty): string {
  if (d.kind === "confirm") return `Did you get ${d.reward}?`;
  if (d.state === "given") return `${d.reward}: waiting for ${d.other} to confirm`;
  return d.overdue ? `You owe ${d.reward} — it's overdue` : `You promised ${d.reward}`;
}

function detail(d: RewardDuty): string {
  if (d.kind === "confirm") return `${d.other} marked it given for “${d.goalTitle}”. Confirm it, or say not yet and the reminders start again.`;
  if (d.state === "given")
    return d.overdue
      ? `It isn't confirmed yet, so Kin is reminding you every 5 minutes (09:00–21:00). Ask ${d.other} to confirm.`
      : `Kin pauses the reminders while ${d.other} confirms.`;
  return d.overdue
    ? `${d.other} reached “${d.goalTitle}”. Kin reminds you every 5 minutes (09:00–21:00) until it's given and confirmed.`
    : `${d.other} reached “${d.goalTitle}”. Give it within a day, then mark it given.`;
}
