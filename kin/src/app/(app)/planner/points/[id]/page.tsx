import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getPointsHistory, type PointsEntry } from "@/lib/queries/routines";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";

const STATUS_LABEL: Record<PointsEntry["status"], string> = {
  counted: "",
  waiting: "waiting for a grown-up",
  granted: "spent",
  held: "on hold until a grown-up answers",
  declined: "declined — points given back",
};

/** One member's points: what they have, and every chore, streak bonus and
 * reward that made it so. Points are not money -- nothing here reads or
 * writes Wealth. Anyone in the household may look; the numbers are the
 * same ones the scoreboard shows. */
export default async function PointsHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;

  const { score, entries } = await getPointsHistory(me.family_id, id);
  if (!score) notFound();
  const first = score.name.split(" ")[0];
  const held = entries
    .filter((e) => e.status === "held")
    .reduce((n, e) => n - e.points, 0);

  return (
    <div
      style={{
        padding: "1rem var(--gutter) 2rem",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <Link
        href="/planner?seg=routines"
        className="btn btn-ghost"
        style={{
          minHeight: "2rem",
          fontSize: "0.8125rem",
          padding: "0 0.5rem",
          gap: "0.25rem",
          marginBottom: "0.5rem",
        }}
      >
        <Icon name="chevronLeft" size={14} /> Tasks
      </Link>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>
        {id === me.id ? "Your points" : `${first}’s points`}
      </h1>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <Stat label="To spend" value={score.spendable} accent />
        <Stat label="Earned" value={score.points} />
        {score.bonus > 0 && <Stat label="Streak bonus" value={score.bonus} />}
        {held > 0 && <Stat label="On hold" value={held} />}
        {score.awaiting > 0 && (
          <Stat label="Chores waiting" value={score.awaiting} />
        )}
      </div>

      <h2
        style={{
          fontSize: "0.75rem",
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: "var(--color-neutral-600)",
          margin: "0 0 0.5rem",
        }}
      >
        History
      </h2>
      {entries.length === 0 ? (
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-neutral-600)",
            margin: 0,
          }}
        >
          Nothing yet. Points come from chores, once a grown-up says they are
          done.
        </p>
      ) : (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
        >
          {entries.map((e, i) => (
            <Blueprint
              key={i}
              style={{
                padding: "0.5625rem 0.75rem",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
              }}
            >
              <Icon
                name={
                  e.kind === "reward"
                    ? "gift"
                    : e.kind === "streak"
                      ? "sparkle"
                      : "check"
                }
                size={16}
                style={{ color: "var(--color-neutral-600)", flex: "none" }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "0.875rem" }}>
                  {e.title}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    color: "var(--color-neutral-600)",
                  }}
                >
                  {new Date(`${e.date}T00:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                  {STATUS_LABEL[e.status] && ` · ${STATUS_LABEL[e.status]}`}
                </span>
              </span>
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  color:
                    e.status === "declined" || e.status === "waiting"
                      ? "var(--color-neutral-500)"
                      : e.points >= 0
                        ? "var(--color-accent-700)"
                        : "var(--color-neutral-900)",
                  textDecoration:
                    e.status === "declined" ? "line-through" : undefined,
                }}
              >
                {e.points > 0 ? "+" : ""}
                {e.points}
              </span>
            </Blueprint>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Blueprint style={{ padding: "0.5625rem 0.75rem", minWidth: 96 }}>
      <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
        {label}
      </div>
      <div
        style={{
          font: "600 1.375rem/1.1 var(--font-heading)",
          color: accent ? "var(--color-accent-700)" : undefined,
        }}
      >
        {value}
      </div>
    </Blueprint>
  );
}
