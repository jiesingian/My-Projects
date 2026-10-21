import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { ChipRow } from "@/components/segmented";
import { RewardsShelf } from "@/components/rewards-shelf";
import { ApprovalQueue } from "@/components/approval-queue";
import { createClient } from "@/lib/supabase/server";
import { FamilyTreatUsed } from "@/components/game-controls";
import { FamilyPackForm, GameGoalEdit, GameGoalForm, GameGoalPause, GameSteps, GameTap, SampleGameButton, StepsGoalForm } from "@/components/game-controls";
import { ProgressBar } from "@/components/progress-bar";
import { getGame, type GameGoalView, type GameView, type PlayerView } from "@/lib/queries/game";
import { getMemberScores, getPendingRedemptions, getRewards, getStreakBonusRates } from "@/lib/queries/routines";
import { getPendingGoalClaims } from "@/lib/queries/goals";
import { KidGoalBoard } from "@/components/kid-goal-board";
import { isBoard } from "@/lib/kid-board";
import { BONUSES, asksOn, FAMILY_STEPS_BONUS, GAME_CATEGORY_META, nextMilestone, partWorth } from "@/lib/game";
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
 * the top of Planner → Goals. */
export function GameSwitch({ view, grownUp }: { view: GameViewName; grownUp: boolean }) {
  const items = (["goals", "game", "badges", "shop", ...(grownUp ? (["setup"] as const) : [])] as GameViewName[]).map((v) => ({
    label: v === "goals" ? "Goals" : v === "game" ? "🎯 Target" : v === "badges" ? "🏅 Badges" : v === "shop" ? "🪙 Shop" : "Set up",
    href: `/planner?seg=goals&g=${v}`,
    active: v === view,
  }));
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <ChipRow items={items} />
    </div>
  );
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
      <GameSwitch view={view} grownUp={grownUp} />
      {(view === "badges" || (view === "game" && !focus)) && playable.length > 1 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <ChipRow
            items={playable.map((p) => ({
              label: p.id === me.id ? "Me" : `Play for ${p.name.split(" ")[0]}`,
              href: `/planner?seg=goals&g=${view}&as=${p.id}`,
              active: p.id === player?.id,
            }))}
          />
        </div>
      )}
      {view === "game" && focus && <GoalFocus game={game} goalId={focus.id} familyId={familyId} me={me} weekStart={weekStart} currency={currency} />}
      {view === "game" && !focus && <TodayView game={game} player={player} grownUp={grownUp} />}
      {view === "badges" && player && <BadgesView game={game} player={player} />}
      {view === "shop" && <ShopView familyId={familyId} me={me} player={game.players.find((p) => p.id === me.id)} />}
      {view === "setup" && grownUp && <SetupView game={game} plus={plus} focus={focus} />}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "0.5rem 0.25rem", borderRadius: 12, background: "color-mix(in srgb, var(--cal-goal) 9%, transparent)" }}>
      <div style={{ font: "600 1.125rem/1.2 var(--font-heading)" }}>{value}</div>
      <div style={{ fontSize: "0.6875rem", color: "var(--color-neutral-600)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </div>
  );
}

const Bar = ProgressBar;

function PlayerCard({ player }: { player: PlayerView }) {
  const lvl = player.level;
  const next = nextMilestone(player.streak);
  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem" }}>
        <div style={{ font: "600 1.125rem/1.2 var(--font-heading)" }}>{player.name.split(" ")[0]}</div>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Level {lvl.level}</div>
      </div>
      <Bar fraction={lvl.into / lvl.needed} label={`Level ${lvl.level}: ${lvl.into} of ${lvl.needed} XP`} />
      <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
        {lvl.into} / {lvl.needed} XP to level {lvl.level + 1}
        {player.xpWaiting > 0 && ` · ${player.xpWaiting} XP waiting for a grown-up’s yes`}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <Stat label="Streak" value={`🔥 ${player.streak}`} />
        <Stat label="Coins" value={`🪙 ${player.coins}`} />
        <Stat label="Freeze" value={player.freezes > 0 ? "❄️ 1" : "❄️ 0"} />
      </div>
      {next && player.streak > 0 && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.5rem" }}>
          {next - player.streak} more day{next - player.streak === 1 ? "" : "s"} to a {next}-day badge.
        </div>
      )}
    </Blueprint>
  );
}

/** What a steps goal has earned today, and what is still to earn. */
function stepsStatus(goal: GameGoalView): string {
  if (!goal.ownerId) return `Everyone's steps this week · +${FAMILY_STEPS_BONUS.xp} XP and +${FAMILY_STEPS_BONUS.coins} coins each when reached`;
  const worth = (part: "half" | "rest") => `+${partWorth(goal.xp, part)} XP${goal.points ? ` · +${partWorth(goal.points, part)} coins` : ""}`;
  if (goal.claim === "counted") return `All the way! ${worth("half")} and ${worth("rest")}`;
  if (goal.claim === "pending") return "All the way · waiting for a grown-up’s yes";
  if (goal.half === "counted") return `Halfway: ${worth("half")} · ${worth("rest")} more at ${goalNumber(goal.target)}`;
  if (goal.half === "pending") return "Halfway · waiting for a grown-up’s yes";
  return `${worth("half")} at ${goalNumber(goal.target / 2)}, ${worth("rest")} more at ${goalNumber(goal.target)}`;
}

function GoalRow({ goal, canTap, helps }: { goal: GameGoalView; canTap: boolean; helps?: string }) {
  const meta = GAME_CATEGORY_META[goal.category];
  const steps = goal.type === "steps";
  const status = steps
    ? stepsStatus(goal)
    : goal.claim === "counted"
      ? `Done! +${goal.xp} XP${goal.points ? ` · +${goal.points} coins` : ""}`
      : goal.claim === "pending"
        ? "Done · waiting for a grown-up’s yes"
        : goal.claim === "refused"
          ? "Not counted this time"
          : goal.ownerId
            ? `+${goal.xp} XP${goal.points ? ` · +${goal.points} coins` : ""} when done`
            : "Everyone adds to this one";
  return (
    <div style={{ display: "flex", flexWrap: steps ? "wrap" : undefined, alignItems: "center", gap: "0.75rem", padding: "0.625rem 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)", opacity: goal.active ? 1 : 0.55 }}>
      <div aria-hidden style={{ fontSize: "1.5rem", width: "2rem", textAlign: "center" }}>
        {goal.reached ? "✅" : steps ? "👟" : meta.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{goal.title}</div>
        <div style={{ margin: "0.25rem 0" }}>
          <Bar fraction={goal.fraction} label={`${goal.title}: ${goalNumber(goal.current)} of ${goalNumber(goal.target)}`} mark={steps && goal.ownerId ? 0.5 : undefined} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
          {goalNumber(goal.current)} / {goalNumber(goal.target)}
          {goal.unit ? ` ${goal.unit}` : ""} · {status}
          {!goal.active && " · paused"}
        </div>
        {helps && (
          <Link href={`/planner?seg=goals&g=game&goal=${goal.helpsGoalId}`} style={{ display: "inline-block", fontSize: "0.71875rem", color: "var(--color-accent-solid)", fontWeight: 600, marginTop: "0.125rem" }}>
            For: {helps} ›
          </Link>
        )}
      </div>
      {canTap && goal.active && !steps && <GameTap goalId={goal.id} title={goal.title} canUndo={goal.current > 0} />}
      {canTap && goal.active && steps && goal.ownerId && (
        <div style={{ flexBasis: "100%", paddingLeft: "2.75rem" }}>
          <GameSteps goalId={goal.id} title={goal.title} />
        </div>
      )}
    </div>
  );
}

function TodayView({ game, player, grownUp }: { game: GameView; player: PlayerView | undefined; grownUp: boolean }) {
  if (!game.hasGoals) {
    return (
      <Blueprint style={{ padding: "1.125rem" }}>
        <div style={{ font: "600 1.125rem/1.2 var(--font-heading)", marginBottom: "0.375rem" }}>Daily targets for the whole family</div>
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", margin: "0 0 0.875rem", lineHeight: 1.45 }}>
          Daily goals like water, brushing teeth and moving earn XP and coins. Finish all of yours for a bonus. When the whole family finishes, everyone gets an extra bonus. Coins buy rewards in the Shop.
        </p>
        {grownUp ? <SampleGameButton /> : <p style={{ fontSize: "0.875rem", margin: 0 }}>Ask a grown-up to set up the targets.</p>}
      </Blueprint>
    );
  }
  if (!player) return null;
  // Today's dailies: on, asked today (weekdays-only goals rest at the
  // weekend), the busy-day backup on its own line (20261020210000).
  const dailies = player.goals.filter((g) => g.period === "day" && !g.backup && (!g.active || asksOn(g.days, game.today)));
  const backups = player.goals.filter((g) => g.period === "day" && g.backup && g.active && asksOn(g.days, game.today));
  const weekly = player.goals.filter((g) => g.period === "week");
  // A young child's own goals, each with a picture: the sticker board.
  const board = player.role === "child_managed" && isBoard(dailies.filter((g) => g.active)) ? dailies.filter((g) => g.active) : null;
  const players = game.players.filter((p) => p.dailiesTotal > 0);
  const helpsOf = (g: GameGoalView) => (g.helpsGoalId ? game.bigGoals.find((b) => b.id === g.helpsGoalId)?.title : undefined);
  const allDone = player.dailiesTotal > 0 && player.dailiesDone === player.dailiesTotal;

  return (
    <>
      <PlayerCard player={player} />
      {player.dailiesTotal > 0 && (
        <p role="status" style={{ fontSize: "0.84375rem", margin: "0 0 0.75rem", padding: "0.5625rem 0.75rem", borderRadius: 12, background: "color-mix(in srgb, var(--cal-goal) 12%, transparent)", lineHeight: 1.45 }}>
          {allDone
            ? `All dailies done! 🎉 +${BONUSES.allDailiesDone.xp} XP and +${BONUSES.allDailiesDone.coins} coins come at midnight.`
            : `${player.dailiesDone} of ${player.dailiesTotal} dailies done. Finish them all for +${BONUSES.allDailiesDone.xp} XP and +${BONUSES.allDailiesDone.coins} coins tonight.`}
        </p>
      )}
      {board ? (
        <KidGoalBoard name={player.name.split(" ")[0]} goals={board.map((g) => ({ id: g.id, title: g.title, emoji: g.emoji ?? "⭐", current: g.current, target: g.target, reached: g.reached }))} />
      ) : (
        <Section title="Today">
          {dailies.length === 0 ? <Empty text="No daily goals yet." /> : dailies.map((g) => <GoalRow key={g.id} goal={g} canTap helps={helpsOf(g)} />)}
        </Section>
      )}
      {backups.length > 0 && <Section title="Busy day? This keeps your streak going">{backups.map((g) => <GoalRow key={g.id} goal={g} canTap helps={helpsOf(g)} />)}</Section>}
      {weekly.length > 0 && <Section title="This week">{weekly.map((g) => <GoalRow key={g.id} goal={g} canTap helps={helpsOf(g)} />)}</Section>}
      {game.familyGoals.length > 0 && <Section title="Family goals">{game.familyGoals.map((g) => <GoalRow key={g.id} goal={g} canTap helps={helpsOf(g)} />)}</Section>}
      {players.length > 0 && (
        <Section title={`The family today · 🏡 ${game.familyStreak}-day family streak`}>
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
        </Section>
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
      {daily.length > 0 && <Section title="Every day">{daily.map((g) => <GoalRow key={g.id} goal={g} canTap={canTap(g)} />)}</Section>}
      {weekly.length > 0 && <Section title="Every week">{weekly.map((g) => <GoalRow key={g.id} goal={g} canTap={canTap(g)} />)}</Section>}
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
  return (
    <>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>
        {player.name.split(" ")[0]} has {earned.size} of {game.badges.length} badges. New ones arrive at midnight.
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
  const [rewards, scores, bonusRates, redemptions, claims, { data: treats }, { data: weeks }] = await Promise.all([
    getRewards(familyId),
    getMemberScores(familyId),
    grownUp ? getStreakBonusRates(familyId) : Promise.resolve(null),
    grownUp ? getPendingRedemptions(familyId) : Promise.resolve([]),
    grownUp ? getPendingGoalClaims(familyId, me) : Promise.resolve([]),
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
        <Link href={`/planner/points/${me.id}`} style={{ display: "flex", alignItems: "center", minHeight: 44, fontSize: "0.8125rem", color: "var(--color-accent-solid)", fontWeight: 600 }}>
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
              {s.awaiting > 0 && <span style={{ color: "var(--cal-money)" }}>· {s.awaiting} waiting</span>}
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
      {grownUp && <ApprovalQueue pending={[]} redemptions={redemptions} goalClaims={claims} />}
      {/* Baon and the jars the coins can be changed into (20261019100000),
          here since 21 October beside the rest of the spending. A grown-up
          sees every child's; a child goes to their own. */}
      {(grownUp || isChild(me.role)) && (
        <Link
          href={grownUp ? "/planner/alkansya" : `/planner/alkansya/${me.id}`}
          className="btn btn-secondary"
          style={{ minHeight: 44, fontSize: "0.8125rem", padding: "0 0.75rem", gap: "0.375rem", marginTop: "0.25rem" }}
        >
          <Icon name="wallet" size={15} /> Alkansya · baon, gastos, ipon, bigay
        </Link>
      )}
    </>
  );
}

function SetupView({ game, plus, focus }: { game: GameView; plus: boolean; focus?: GameView["bigGoals"][number] }) {
  const preset = focus ? { goalId: focus.id, who: focus.ownerId ?? "family" } : undefined;
  const all = [...game.players.flatMap((p) => p.goals.map((g) => ({ g, who: p.name.split(" ")[0] }))), ...game.familyGoals.map((g) => ({ g, who: "Whole family" }))];
  return (
    <>
      {/* Opened from a goal: straight to its new target. */}
      {!game.hasGoals && !focus && (
        <div style={{ marginBottom: "0.75rem" }}>
          <SampleGameButton />
        </div>
      )}
      {!focus && (
        <div style={{ marginBottom: "0.75rem" }}>
          <FamilyPackForm people={game.players.map((p) => ({ id: p.id, label: p.name.split(" ")[0], grownUp: isGrownUp(p.role) }))} plus={plus} />
        </div>
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
        Rename, change, pause or remove a target with Edit and Pause above. Rewards are added and retired in the Shop. Streaks, bonuses and badges are worked out at midnight.
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
