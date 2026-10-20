"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { ProgressBar } from "@/components/progress-bar";
import { GoalQuickAdd, type GoalQuickAddHow } from "@/components/goal-controls";
import { GOALS_COOKIE_MAX_AGE, goalsCookieName, goalsSummary } from "@/lib/today-goals";

export type TodayGoalRow = {
  id: string;
  title: string;
  icon: IconName;
  /** A child's picture, shown instead of the icon. */
  emoji?: string | null;
  /** "5/8". */
  progress: string;
  fraction: number;
  /** A tick on the bar: a steps game goal's 50%. */
  mark?: number;
  reached: boolean;
  how: GoalQuickAddHow;
  /** What tapping the row shows: XP and coins, where it fills from, the
   * full controls (Undo, a day, a typed number). Rendered on the server. */
  details: ReactNode;
};

/** Today's Goals, collapsible (Janine, 20 October). The header is a real
 * button (aria-expanded, Enter and Space work as on any button); the list
 * slides open and shut (instantly for anyone who asks their phone for less
 * motion); the member's choice is kept on this device in a cookie the
 * server reads, so the page arrives already open or closed. */
/** A child with no login, whose goals a grown-up ticks (20261020190000). */
export type TodayGoalGroup = { id: string; name: string; todo: TodayGoalRow[]; done: TodayGoalRow[] };

export function TodayGoalsPanel({
  memberId,
  open: initiallyOpen,
  todo,
  done,
  groups = [],
  backups = [],
}: {
  memberId: string;
  open: boolean;
  todo: TodayGoalRow[];
  done: TodayGoalRow[];
  groups?: TodayGoalGroup[];
  backups?: TodayGoalRow[];
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const regionId = useId();
  const total = todo.length + done.length;
  const allDone = total > 0 && todo.length === 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    document.cookie = `${goalsCookieName(memberId)}=${next ? "1" : "0"}; path=/; max-age=${GOALS_COOKIE_MAX_AGE}; samesite=lax`;
  };

  return (
    <section id="goals" className="kin-goals" aria-label="Today’s Goals">
      <button type="button" className="kin-goals-head" aria-expanded={open} aria-controls={regionId} onClick={toggle}>
        <span className="kin-goals-head-text">
          <span className="kin-goals-title">Today’s Goals</span>
          <span className={allDone ? "kin-goals-count kin-goals-count-done" : "kin-goals-count"}> · {goalsSummary(done.length, total)}</span>
        </span>
        <span className="kin-goals-head-bar">
          <ProgressBar fraction={total ? done.length / total : 0} label={`${done.length} of ${total} goals done`} height={4} />
        </span>
        <span aria-hidden className="kin-chevron" data-open={open}>
          <Icon name="chevronLeft" size={16} />
        </span>
      </button>

      <div id={regionId} className="kin-collapse" data-open={open} inert={!open}>
        <div>
          <div className="kin-goals-list">
            {todo.map((g) => (
              <GoalRow key={g.id} row={g} />
            ))}
            {done.length > 0 && <DoneGroup rows={done} />}
            {backups.length > 0 && (
              <div className="kin-goals-backup">
                <div className="kin-goals-sub">Busy day? This keeps your streak going</div>
                {backups.map((g) => (
                  <GoalRow key={g.id} row={g} />
                ))}
              </div>
            )}
            {groups.map((group) => (
              <div key={group.id} className="kin-goals-child">
                <div className="kin-goals-sub">
                  {group.name} · {group.done.length} of {group.todo.length + group.done.length} done
                </div>
                {group.todo.map((g) => (
                  <GoalRow key={g.id} row={g} />
                ))}
                {group.done.length > 0 && <DoneGroup rows={group.done} />}
              </div>
            ))}
            <Link href="/planner?seg=goals" className="kin-goals-all">
              All goals
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function DoneGroup({ rows }: { rows: TodayGoalRow[] }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div className="kin-goals-done">
      <button type="button" className="kin-goals-done-head" aria-expanded={open} aria-controls={regionId} onClick={() => setOpen((o) => !o)}>
        <span>Done ({rows.length})</span>
        <span aria-hidden className="kin-chevron" data-open={open}>
          <Icon name="chevronLeft" size={14} />
        </span>
      </button>
      <div id={regionId} className="kin-collapse" data-open={open} inert={!open}>
        <div>
          {rows.map((g) => (
            <GoalRow key={g.id} row={g} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A compact goal: icon, name, "5/8", a thin bar and "+". Tapping the row
 * opens its details. The "+" is a sibling of the row's button, never inside
 * it -- a button in a button is neither valid nor reachable by keyboard. */
function GoalRow({ row }: { row: TodayGoalRow }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <div className="kin-goal-row" data-done={row.reached}>
      <div className="kin-goal-line">
        <button type="button" className="kin-goal-main" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((o) => !o)}>
          <span className="kin-goal-icon" aria-hidden>
            {row.reached ? <Icon name="check" size={16} /> : row.emoji ? <span className="kin-goal-emoji">{row.emoji}</span> : <Icon name={row.icon} size={16} />}
          </span>
          <span className="kin-goal-body">
            <span className="kin-goal-name-line">
              <span className="kin-goal-name">{row.title}</span>
              <span className="kin-goal-progress">{row.progress}</span>
            </span>
            <ProgressBar fraction={row.fraction} mark={row.mark} label={`${row.title}: ${row.progress}`} height={4} />
          </span>
        </button>
        {!row.reached && <GoalQuickAdd goalId={row.id} title={row.title} how={row.how} onOpen={() => setOpen(true)} />}
      </div>
      <div id={detailsId} className="kin-collapse" data-open={open} inert={!open}>
        <div>
          <div className="kin-goal-details">{row.details}</div>
        </div>
      </div>
    </div>
  );
}
