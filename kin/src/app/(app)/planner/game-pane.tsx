import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { PickButton } from "@/components/pick-button";
import { RewardsShelf } from "@/components/rewards-shelf";
import { ApprovalQueue } from "@/components/approval-queue";
import { createClient } from "@/lib/supabase/server";
import { FamilyTreatUsed } from "@/components/game-controls";
import { GameGoalEdit, GameGoalForm, GameGoalPause, GameSteps, GameTap, StartFreshButton, StepsGoalForm } from "@/components/game-controls";
import { targetGroups } from "@/lib/goal-groups";
import { ProgressBar } from "@/components/progress-bar";
import { getGame, type GameGoalView, type GameView, type PlayerView } from "@/lib/queries/game";
import { getMemberScores, getPendingApprovals, getPendingRedemptions, getRewards, getStreakBonusRates } from "@/lib/queries/routines";
import { getGoalRequestsFor, getPendingGoalClaims } from "@/lib/queries/goals";
import { KidGoalBoard } from "@/components/kid-goal-board";
import { isBoard } from "@/lib/kid-board";
import { BONUSES, asksOn, GAME_CATEGORY_META, nextMilestone } from "@/lib/game";
import { daysLeftText, goalNumber } from "@/lib/goals";
import { getGoals } from "@/lib/queries/goals";
import { caption } from "./goals-pane";
import { isChild, isGrownUp } from "@/lib/roles";
import { bonusOn } from "@/lib/streaks";
import { familyDay } from "@/lib/time";
import { Icon } from "@/components/icons";
import type { WeekStart } from "@/lib/week";

export const GAME_VIEWS = ["goals", "game", "badges", "shop", "setup"] as const;
export type GameViewName = (typeof GAME_VIEWS)[number];

/** Goals · Target · Badges · Shop (and Set up, for a grown-up): the switch at
 * the top of Planner → Goals. One button like the Who filter, not a row of
 * chips (Janine, 26 October): tap for the next view, hold for all. */
export function GameSwitch({ view, grownUp }: { view: GameViewName; grownUp: boolean }) {
  const options = (["goals", "game", "badges", "shop", ...(grownUp ? (["setup"] as const) : [])] as GameViewName[]).map((v) => ({
    label: gameViewLabel(v),
    href: `/planner?seg=goals&g=${v}`,
    active: v === view,
  }));
  return <PickButton title="View" label={gameViewLabel(view)} options={options} />;
}

function gameViewLabel(v: GameViewName) {
  return v === "goals" ? "Goals" : v === "game" ? "🎯 Target" : v === "badges" ? "🏅 Badges" : v === "shop" ? "🪙 Shop" : "Set up";
}

/** Planner → Goals → Target, Badges, Shop and Set up (Janine, 20 October;
 * "Target", not "Game", since 21 October).
 * The same goals, points and rewards as the rest of Planner, played as a
 * game. A grown-up can play for a child with no login (`as`). */
export async function GamePane({
  familyId,
  me,
  view,
  as,
  weekStart,
  plus,
  forGoal,
  currency,
}: {
  familyId: string;
  me: { id: string; role: string };
  view: Exclude<GameViewName, "goals">;
  as?: string;
  weekStart: WeekStart;
  /** Kin Plus: steps goals (20261020150000). */
  plus: boolean;
  /** Opened from a goal on Planner → Goals (20261021030000): its targets
   * alone, and Set up ready to add one for it. */
  forGoal?: string;
  currency: string;
}) {
  const grownUp = isGrownUp(me.role);
  const game = await getGame(familyId, weekStart);
  // Who the screen is for: yourself, or -- for a grown-up -- a child the
  // grown-up plays for (no login of their own).
  const playable = game.players.filter((p) => p.id === me.id || (grownUp && p.role === "child_managed"));
  const player = playable.find((p) => p.id === as) ?? playable.find((p) => p.id === me.id) ?? game.players[0];
  const focus = forGoal ? game.bigGoals.find((g) => g.id === forGoal) : undefined;

  return (
    <>
      {/* The view and, where a grown-up plays for a child, whose card it is:
          one line of buttons, like Who on the other tabs. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <GameSwitch view={view} grownUp={grownUp} />
        {(view === "badges" || (view === "game" && !focus)) && playable.length > 1 && player && (
          <PickButton
            title="Playing as"
            icon="users"
            label={player.id === me.id ? "Me" : `Play for ${player.name.split(" ")[0]}`}
            options={playable.map((p) => ({
              label: p.id === me.id ? "Me" : `Play for ${p.name.split(" ")[0]}`,
              href: `/planner?seg=goals&g=${view}&as=${p.id}`,
              active: p.id === player.id,
            }))}
          />
        )}
      </div>
      {view === "game" && focus && <GoalFocus game={game} goalId={focus.id} familyId={familyId} me={me} weekStart={weekStart} currency={currency} />}
      {view === "game" && !focus && <TodayView game={game} player={player} grownUp={grownUp} />}
      {view === "badges" && player && <BadgesView game={game} player={player} />}
      {view === "shop" && <ShopView familyId={familyId} me={me} player={game.players.find((p) => p.id === me.id)} />}
      {view === "setup" && grownUp && <SetupView game={game} plus={plus} focus={focus} />}
    </>
  );
}

const Bar = ProgressBar;

/** Level, XP, streak, coins and freeze: kept, in one small card (Janine, 21
 * October). The next badge is on Badges. */
function PlayerCard({ player }: { player: PlayerView }) {
  const lvl = player.level;
  const stat = { display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem", fontWeight: 600 } as const;
  return (
    <Blueprint style={{ padding: "0.75rem 0.875rem", marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.375rem" }}>
        <div style={{ font: "600 1rem/1.2 var(--font-heading)" }}>
          {player.name.split(" ")[0]} · Level {lvl.level}
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
          {lvl.into}/{lvl.needed} XP
        </div>
      </div>
      <Bar fraction={lvl.into / lvl.needed} label={`Level ${lvl.level}: ${lvl.into} of ${lvl.needed} XP`} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginTop: "0.625rem" }}>
        <span style={stat} aria-label={`${player.streak}-day streak`}>
          🔥 {player.streak} <span style={{ fontWeight: 400, color: "var(--color-neutral-600)", fontSize: "0.75rem" }}>streak</span>
        </span>
        <span style={stat} aria-label={`${player.coins} coins`}>
          🪙 {player.coins} <span style={{ fontWeight: 400, color: "var(--color-neutral-600)", fontSize: "0.75rem" }}>coins</span>
        </span>
        <span style={stat} aria-label={`${player.freezes > 0 ? 1 : 0} freeze`}>
          ❄️ {player.freezes > 0 ? 1 : 0} <span style={{ fontWeight: 400, color: "var(--color-neutral-600)", fontSize: "0.75rem" }}>freeze</span>
        </span>
      </div>
      {player.xpWaiting > 0 && <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>{player.xpWaiting} XP waiting for a grown-up’s yes</div>}
    </Blueprint>
  );
}

/** Done for this day or week: met, or claimed (a child's, waiting for a yes). */
function isDone(g: GameGoalView): boolean {
  return g.reached || g.claim === "counted" || g.claim === "pending";
}

/** One slim line a target (Janine, 21 October): its picture, its name, a
 * count when there is more than one to do, and the button. What it is worth
 * is on Set up and in the "+XP" when it is ticked. Steps open their own
 * logging under "Log steps". */
function GoalRow({ goal, canTap }: { goal: GameGoalView; canTap: boolean }) {
  const meta = GAME_CATEGORY_META[goal.category];
  const steps = goal.type === "steps";
  const notes = [
    steps || goal.target > 1 ? `${goalNumber(goal.current)}/${goalNumber(goal.target)}${goal.unit && goal.unit !== "done" ? ` ${goal.unit}` : ""}${goal.period === "week" ? " this week" : ""}` : goal.period === "week" ? "this week" : null,
    goal.backup ? "busy-day backup" : null,
    !goal.ownerId ? "everyone adds" : null,
    goal.claim === "pending" || goal.half === "pending" ? "waiting for a grown-up’s yes" : null,
    goal.claim === "refused" ? "not counted this time" : null,
  ].filter(Boolean);
  return (
    <div style={{ borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", minHeight: 52, padding: "0.375rem 0" }}>
        <div aria-hidden style={{ fontSize: "1.25rem", width: "1.75rem", textAlign: "center", flex: "none" }}>
          {isDone(goal) ? "✅" : steps ? "👟" : (goal.emoji ?? meta.emoji)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.25 }}>{goal.title}</div>
          {notes.length > 0 && <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{notes.join(" · ")}</div>}
        </div>
        {canTap && goal.active && !steps && <GameTap goalId={goal.id} title={goal.title} canUndo={goal.current > 0} />}
      </div>
      {canTap && goal.active && steps && goal.ownerId && (
        <details className="kin-target-log" style={{ padding: "0 0 0.5rem 2.375rem" }}>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent-700)" }}>Log steps</summary>
          <GameSteps goalId={goal.id} title={goal.title} />
        </details>
      )}
    </div>
  );
}

/** A goal's targets on Target: still to do, then -- folded -- done. */
function TargetList({ targets, canTap }: { targets: GameGoalView[]; canTap: (g: GameGoalView) => boolean }) {
  const open = targets.filter((g) => !isDone(g));
  const finished = targets.filter(isDone);
  return (
    <>
      {open.map((g) => (
        <GoalRow key={g.id} goal={g} canTap={canTap(g)} />
      ))}
      {finished.length > 0 && (
        <details className="kin-fold" style={{ marginTop: "0.25rem" }}>
          <summary style={{ minHeight: 44, fontSize: "0.8125rem", borderBottom: 0 }}>
            <Icon name="chevronLeft" size={14} className="kin-fold-mark" />
            <span>Done ({finished.length})</span>
          </summary>
          {finished.map((g) => (
            <GoalRow key={g.id} goal={g} canTap={canTap(g)} />
          ))}
        </details>
      )}
    </>
  );
}

/** Target (Janine, 21 October): the player's card, then their targets
 * grouped by the goal each one helps -- today's dailies and this week's
 * weeklies -- and the household's shared targets with them. Targets that
 * help no goal (from before) wait, folded, at the end. */
function TodayView({ game, player, grownUp }: { game: GameView; player: PlayerView | undefined; grownUp: boolean }) {
  if (!game.hasGoals) {
    return (
      <Blueprint style={{ padding: "1.125rem" }}>
        <div style={{ font: "600 1.125rem/1.2 var(--font-heading)", marginBottom: "0.375rem" }}>Targets come from your goals</div>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0 0 0.875rem", lineHeight: 1.45 }}>
          Set a goal, then add the daily and weekly things that get you there — they earn XP and coins here, and coins buy rewards in the Shop.
        </p>
        {grownUp ? (
          <Link href="/planner?seg=goals" className="btn btn-primary btn-block">
            Go to Goals
          </Link>
        ) : (
          <p style={{ fontSize: "0.875rem", margin: 0 }}>Ask a grown-up to set up the targets.</p>
        )}
      </Blueprint>
    );
  }
  if (!player) return null;
  // On today: a daily asked today (weekdays-only ones rest at the weekend),
  // or a weekly; paused ones wait in Set up.
  const live = (g: GameGoalView) => g.active && (g.period === "week" || asksOn(g.days, game.today));
  const dailies = player.goals.filter((g) => live(g) && g.period === "day" && !g.backup);
  // A young child's own goals, each with a picture: the sticker board.
  const board = player.role === "child_managed" && isBoard(dailies) ? dailies : null;
  const mine = [...player.goals.filter((g) => live(g) && !(board && board.includes(g))), ...game.familyGoals.filter(live)];
  const groups = targetGroups(mine, game.bigGoals);
  const players = game.players.filter((p) => p.dailiesTotal > 0);
  const roleOf = new Map(game.players.map((p) => [p.id, p.role]));
  const canTap = (g: GameGoalView) => g.ownerId === null || g.ownerId === player.id || (grownUp && roleOf.get(g.ownerId) === "child_managed");

  return (
    <>
      <PlayerCard player={player} />
      {board && (
        <KidGoalBoard name={player.name.split(" ")[0]} goals={board.map((g) => ({ id: g.id, title: g.title, emoji: g.emoji ?? "⭐", current: g.current, target: g.target, reached: g.reached }))} />
      )}
      {player.dailiesTotal > 0 && (
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
          Today · {player.dailiesDone} of {player.dailiesTotal} done{player.dailiesDone === player.dailiesTotal ? " 🎉" : ""}
        </div>
      )}
      {groups.length === 0 && <Empty text="Nothing to do here today. Add targets from a goal on the Goals tab." />}
      {groups.map(({ goal, targets }) =>
        goal ? (
          <section key={goal.id} style={{ marginBottom: "1rem" }}>
            <Link href={`/planner?seg=goals&g=game&goal=${goal.id}`} style={{ display: "flex", alignItems: "baseline", gap: "0.375rem", minHeight: 32, color: "inherit", textDecoration: "none" }}>
              <span style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>{goal.title}</span>
              {daysLeftText(goal.dueDate, game.today) && <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>· {daysLeftText(goal.dueDate, game.today)}</span>}
              <span aria-hidden style={{ marginLeft: "auto", color: "var(--color-neutral-600)" }}>
                ›
              </span>
            </Link>
            <TargetList targets={targets} canTap={canTap} />
          </section>
        ) : (
          <details key="loose" className="kin-fold" style={{ marginBottom: "1rem" }}>
            <summary style={{ minHeight: 44, fontSize: "0.875rem" }}>
              <Icon name="chevronLeft" size={14} className="kin-fold-mark" />
              <span>Not linked to a goal ({targets.length})</span>
            </summary>
            <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.375rem 0", lineHeight: 1.4 }}>
              From before targets came from goals. Link each one to a goal with Edit in Set up, or remove them all there.
            </p>
            <TargetList targets={targets} canTap={canTap} />
          </details>
        ),
      )}
      {players.length > 0 && (
        <details className="kin-fold" style={{ marginBottom: "0.75rem" }}>
          <summary style={{ minHeight: 44, fontSize: "0.875rem" }}>
            <Icon name="chevronLeft" size={14} className="kin-fold-mark" />
            <span>The family today · 🏡 {game.familyStreak}-day streak</span>
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingTop: "0.5rem" }}>
            {players.map((p) => {
              const finished = p.dailiesDone === p.dailiesTotal;
              return (
                <span key={p.id} className="chip" data-active={finished} title={`${p.dailiesDone} of ${p.dailiesTotal}`}>
                  {finished ? "✅" : "⏳"} {p.name.split(" ")[0]} {p.dailiesDone}/{p.dailiesTotal}
                </span>
              );
            })}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0", lineHeight: 1.4 }}>
            When everyone finishes, everyone gets +{BONUSES.wholeFamilyDone.xp} XP and +{BONUSES.wholeFamilyDone.coins} coins.
          </p>
        </details>
      )}
      {player.dailiesTotal > 0 && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
          Finish all of today&rsquo;s for +{BONUSES.allDailiesDone.xp} XP and +{BONUSES.allDailiesDone.coins} coins at midnight.
        </p>
      )}
    </>
  );
}

/** Target, opened from a goal (Janine, 21 October): the goal at the top --
 * where it stands, what it aims at, the days left -- and only the targets
 * that help it. Ticking is the same as anywhere: whose a target is decides
 * who may tick it (game_log). */
async function GoalFocus({ game, goalId, familyId, me, weekStart, currency }: { game: GameView; goalId: string; familyId: string; me: { id: string; role: string }; weekStart: WeekStart; currency: string }) {
  const grownUp = isGrownUp(me.role);
  const goal = (await getGoals(familyId, me, weekStart)).find((g) => g.id === goalId);
  const all = [...game.players.flatMap((p) => p.goals), ...game.familyGoals].filter((g) => g.helpsGoalId === goalId);
  const roleOf = new Map(game.players.map((p) => [p.id, p.role]));
  const canTap = (g: GameGoalView) => g.ownerId === null || g.ownerId === me.id || (grownUp && roleOf.get(g.ownerId) === "child_managed");
  const left = goal ? daysLeftText(goal.dueDate, game.today) : null;
  const daily = all.filter((g) => g.period === "day");
  const weekly = all.filter((g) => g.period === "week");
  return (
    <>
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>For the goal</div>
            <div style={{ font: "600 1.125rem/1.25 var(--font-heading)" }}>{goal?.title ?? game.bigGoals.find((b) => b.id === goalId)?.title}</div>
          </div>
          <Link href="/planner?seg=goals&g=game" className="btn btn-ghost" style={{ minHeight: 44, fontSize: "0.8125rem", padding: "0 0.5rem", flex: "none" }}>
            ✕ Show all
          </Link>
        </div>
        {goal && (
          <>
            <div style={{ margin: "0.5rem 0 0.25rem" }}>
              <Bar fraction={goal.fraction} label={`${goal.title}: ${Math.round(goal.fraction * 100)}%`} />
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>{caption(goal, currency)}</div>
            {left && (
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginTop: "0.125rem", color: left.includes("past") ? "var(--cal-occasion)" : undefined }}>
                {left}
              </div>
            )}
          </>
        )}
      </Blueprint>
      {all.length === 0 && <Empty text="No targets for this goal yet. Add the daily and weekly things that get you there: a diet, a steps target, a sport twice a week." />}
      {daily.length > 0 && (
        <Section title="Every day">
          <TargetList targets={daily} canTap={canTap} />
        </Section>
      )}
      {weekly.length > 0 && (
        <Section title="Every week">
          <TargetList targets={weekly} canTap={canTap} />
        </Section>
      )}
      {grownUp && (
        <Link href={`/planner?seg=goals&g=setup&goal=${goalId}`} className="btn btn-secondary btn-block" style={{ gap: "0.375rem", minHeight: 44 }}>
          + Add a target for this goal
        </Link>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "1rem" }}>
      <div style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>{title}</div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>{text}</p>;
}

function BadgesView({ game, player }: { game: GameView; player: PlayerView }) {
  const earned = new Map(player.badges.map((b) => [b.id, b.earnedOn]));
  const next = nextMilestone(player.streak);
  return (
    <>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>
        {player.name.split(" ")[0]} has {earned.size} of {game.badges.length} badges. New ones arrive the moment they&rsquo;re earned.
        {next && player.streak > 0 && ` ${next - player.streak} more day${next - player.streak === 1 ? "" : "s"} to a ${next}-day badge.`}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(7.5rem, 1fr))", gap: "0.5rem" }}>
        {game.badges.map((b) => {
          const on = earned.get(b.id);
          return (
            <Blueprint key={b.id} style={{ padding: "0.75rem 0.5rem", textAlign: "center", opacity: on ? 1 : 0.5 }}>
              <div aria-hidden style={{ fontSize: "1.75rem", filter: on ? undefined : "grayscale(1)" }}>
                {on ? b.icon : "🔒"}
              </div>
              <div style={{ fontWeight: 600, fontSize: "0.8125rem", marginTop: "0.25rem" }}>{b.title}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-600)", lineHeight: 1.35, marginTop: "0.125rem" }}>{b.description}</div>
              {on && <div style={{ fontSize: "0.6875rem", marginTop: "0.25rem" }}>Earned {on}</div>}
            </Blueprint>
          );
        })}
      </div>
    </>
  );
}

async function ShopView({ familyId, me, player }: { familyId: string; me: { id: string; role: string }; player: PlayerView | undefined }) {
  const grownUp = isGrownUp(me.role);
  const supabase = await createClient();
  const [rewards, scores, bonusRates, chores, redemptions, claims, goalRequests, { data: treats }, { data: weeks }] = await Promise.all([
    getRewards(familyId),
    getMemberScores(familyId),
    grownUp ? getStreakBonusRates(familyId) : Promise.resolve(null),
    // Chores waiting for a grown-up's OK: here with the rewards since 21
    // October, when approvals left Today (Janine).
    grownUp ? getPendingApprovals(familyId) : Promise.resolve([]),
    grownUp ? getPendingRedemptions(familyId) : Promise.resolve([]),
    grownUp ? getPendingGoalClaims(familyId, me) : Promise.resolve([]),
    // A reward the reader was asked to give and a change to a goal whose
    // reward they give (23 October): anyone can be the giver, a child too,
    // so these are asked for everyone. They were answered only on each
    // goal's card after approvals left Today on 21 October.
    getGoalRequestsFor(familyId, me),
    // The family-week treat (20261020210000): unlocked by a week of every
    // family goal met, never bought with coins.
    supabase.from("rewards").select("id, title, budget_amount").eq("family_id", familyId).eq("active", true).eq("unlock", "family_week").limit(1),
    supabase.from("game_family_weeks").select("week_start, all_done, treat_used_at").eq("family_id", familyId).order("week_start", { ascending: false }).limit(1),
  ]);
  const treat = treats?.[0];
  const week = weeks?.[0];
  const others = scores.filter((s) => s.id !== me.id && (s.points > 0 || s.awaiting > 0));
  return (
    <>
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div aria-hidden style={{ fontSize: "1.75rem" }}>
          🪙
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: "600 1.25rem/1.2 var(--font-heading)" }}>{player?.coins ?? 0} coins</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>From goals and chores. A request waits for a grown-up’s yes.</div>
        </div>
        <Link href={`/planner/points/${me.id}`} style={{ display: "flex", alignItems: "center", minHeight: 44, fontSize: "0.8125rem", color: "var(--color-accent-700)", fontWeight: 600 }}>
          History ›
        </Link>
      </Blueprint>
      {/* Everyone's coins, for a grown-up: what the Tasks scoreboard showed
          until 21 October, each opening that person's history. */}
      {grownUp && others.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.25rem", marginBottom: "0.875rem" }}>
          {others.map((s) => (
            <Link
              key={s.id}
              href={`/planner/points/${s.id}`}
              aria-label={`${s.name}: ${s.spendable} coins, history`}
              className="btn btn-secondary"
              style={{ flex: "none", minHeight: 44, fontSize: "0.8125rem", padding: "0 0.75rem", gap: "0.375rem" }}
            >
              {s.name.split(" ")[0]} · 🪙 {s.spendable}
              {s.awaiting > 0 && <span style={{ color: "var(--cal-money-ink)" }}>· {s.awaiting} waiting</span>}
            </Link>
          ))}
        </div>
      )}
      {treat && (
        <Blueprint style={{ padding: "0.75rem 0.875rem", marginBottom: "0.875rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>🎉 {treat.title}</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem", lineHeight: 1.4 }}>
            {week?.all_done && !week.treat_used_at
              ? "Unlocked! Every family goal was met last week."
              : week?.all_done && week.treat_used_at
                ? "Enjoyed. Meet every family goal again this week to unlock it again."
                : "Unlocks when every family goal of the week is met."}
          </div>
          {grownUp && week?.all_done && !week.treat_used_at && <FamilyTreatUsed week={week.week_start} />}
        </Blueprint>
      )}
      <RewardsShelf
        rewards={rewards}
        me={scores.find((s) => s.id === me.id)}
        canManage={grownUp}
        streakBonus={bonusRates ? bonusOn(bonusRates, familyDay()) : undefined}
      />
      <ApprovalQueue pending={chores} redemptions={redemptions} goalClaims={claims} goalRewards={goalRequests.rewards} goalChanges={goalRequests.changes} />
      {/* Baon and the jars the coins can be changed into (20261019100000),
          here since 21 October beside the rest of the spending. A grown-up
          sees every child's; a child goes to their own. */}
      {(grownUp || isChild(me.role)) && (
        <Link
          href={grownUp ? "/planner/alkansya" : `/planner/alkansya/${me.id}`}
          className="btn btn-secondary"
          style={{ minHeight: 44, fontSize: "0.8125rem", padding: "0 0.75rem", gap: "0.375rem", marginTop: "0.25rem" }}
        >
          <Icon name="wallet" size={15} /> Piggy bank · allowance, spend, save, give
        </Link>
      )}
    </>
  );
}

function SetupView({ game, plus, focus }: { game: GameView; plus: boolean; focus?: GameView["bigGoals"][number] }) {
  const preset = focus ? { goalId: focus.id, who: focus.ownerId ?? "family" } : undefined;
  const all = [...game.players.flatMap((p) => p.goals.map((g) => ({ g, who: p.name.split(" ")[0] }))), ...game.familyGoals.map((g) => ({ g, who: "Whole family" }))];
  const loose = all.filter(({ g }) => !g.helpsGoalId).length;
  return (
    <>
      {/* Every target comes from a goal (Janine, 21 October): the ones from
          before, which help none, can all go at once. */}
      {!focus && loose > 0 && (
        <div style={{ marginBottom: "0.875rem" }}>
          <StartFreshButton count={loose} />
        </div>
      )}
      {game.bigGoals.length === 0 && (
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, margin: "0 0 0.875rem" }}>
          Targets come from goals. <Link href="/planner/goals/new" style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>Set a goal</Link> first, then add the daily and weekly things that get you there.
        </p>
      )}
      <div style={{ marginBottom: "1rem" }}>
        {focus && (
          <p role="status" style={{ fontSize: "0.84375rem", margin: "0 0 0.5rem", lineHeight: 1.45 }}>
            A new target for <strong>{focus.title}</strong>.
          </p>
        )}
        <GameGoalForm people={game.players.map((p) => ({ id: p.id, label: p.name.split(" ")[0] }))} goals={game.bigGoals} preset={preset} />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        {plus ? (
          <StepsGoalForm people={game.players.map((p) => ({ id: p.id, label: p.name.split(" ")[0], child: p.role === "child_self" || p.role === "child_managed" }))} goals={game.bigGoals} preset={preset} />
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: 0, lineHeight: 1.45 }}>🏃 Steps goals, and the family&rsquo;s weekly steps, are part of Kin Plus.</p>
        )}
      </div>
      <Section title={`Targets · ${all.length}`}>
        {all.length === 0 && <Empty text="None yet." />}
        {all.map(({ g, who }) => (
          <div key={g.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)", opacity: g.active ? 1 : 0.55 }}>
            <span aria-hidden>{GAME_CATEGORY_META[g.category].emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{g.title}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                {who} · {goalNumber(g.target)} {g.unit ?? ""} a {g.period} · {g.xp} XP · {g.points} coins
                {g.days ? ` · ${daysText(g.days)}` : ""}
                {g.backup ? " · backup" : ""}
                {g.creditTo === "logger" ? " · credits whoever ticks it" : ""}
                {g.active ? "" : " · paused"}
                {g.helpsGoalId && game.bigGoals.find((b) => b.id === g.helpsGoalId) ? ` · for ${game.bigGoals.find((b) => b.id === g.helpsGoalId)?.title}` : ""}
              </div>
            </div>
            <GameGoalPause goalId={g.id} active={g.active} />
            <GameGoalEdit goal={{ id: g.id, title: g.title, category: g.category, period: g.period, target: g.target, xp: g.xp, points: g.points, days: g.days, emoji: g.emoji, owned: g.ownerId !== null, ownerId: g.ownerId, helpsGoalId: g.helpsGoalId }} goals={game.bigGoals} />
          </div>
        ))}
      </Section>
      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
        Rename, change, pause or remove a target with Edit and Pause above. Rewards are added and retired in the Shop. Streaks and bonuses are worked out at midnight; badges arrive the moment they&rsquo;re earned.
      </p>
    </>
  );
}

/** "weekdays", "Mon, Wed, Fri". */
function daysText(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.join() === "1,2,3,4,5") return "weekdays";
  if (sorted.join() === "6,7") return "weekends";
  return sorted.map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]).join(", ");
}
