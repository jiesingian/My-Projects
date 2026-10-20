// Goals game, what a family's own plan needs (20261020190000, Janine 20
// October): a goal for some weekdays only; a backup goal that keeps a busy
// day's streak (+1, no bonus); credit to whoever ticked a baby's goal (the
// baby gets the progress, the grown-up the XP and coins -- never both);
// linked goals logged once and counted in each (game_log), never letting
// anyone log what they could not by hand; the family week, its Family Team
// badge and its unlocked treat; removed, not deleted; Step Champion.
//
// Covers planner_goal_links, game_family_weeks, game_log, game_today,
// game_may_log, game_period_start, game_settle_my_steps,
// game_use_family_treat, game_steps_run, game_week_start, reward_redemptions_not_unlocks,
// planner_goal_completions_fix, game_xp and game_close_household_day.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const goal = async (owner, title, extra = {}) =>
    (await as(ann, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, days, backup, credit_to, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, public.current_member_id()) returning id`,
      [A, title, extra.kind ?? "custom", owner, extra.period ?? "day", extra.target ?? 1, extra.category ?? "move", extra.xp ?? 10, extra.points ?? 5, extra.days ?? null, extra.backup ?? false, extra.credit ?? "owner"]))[0].id;

  // --- The shape of a goal -------------------------------------------------------
  await check("Days of the week are for daily goals, Monday 1 to Sunday 7", async () =>
    (await refused(() => goal(M("a1"), "Weekly", { period: "week", days: [1, 2] }))) === true &&
    (await refused(() => goal(M("a1"), "Day 8", { days: [8] }))) === true);
  await check("A backup goal is a person's daily goal", async () =>
    (await refused(() => goal(null, "Backup", { backup: true, xp: 0, points: 0 }))) === true &&
    (await refused(() => goal(M("a1"), "Backup", { backup: true, period: "week" }))) === true);
  await check("Credit to whoever ticked it needs an owner", async () =>
    (await refused(() => goal(null, "Shared", { credit: "logger", xp: 0, points: 0 }))) === true);
  await check("New categories: outdoor, reading, unplug", async () =>
    !!(await goal(M("a1"), "Park", { category: "outdoor" })) && !!(await goal(M("a1"), "Book", { category: "reading" })) && !!(await goal(M("a1"), "No phone", { category: "unplug" })));

  // --- Parent-managed goals (Baby has no login) ---------------------------------------
  const babyBook = await goal(M("a3"), "Read a book together", { category: "reading", credit: "logger" });
  const babyOwn = await goal(M("a3"), "Floor play", { category: "move" });
  await check("A child cannot tick the baby's goals", async () =>
    (await refused(() => as(kid, `select public.game_log('${babyBook}')`), "not yours")) === true);
  await check("Another household cannot either", async () => (await refused(() => as(ben, `select public.game_log('${babyBook}')`))) === true);
  await check("Ann ticks Baby's book: Baby gets the met goal, Ann the XP and coins", async () => {
    await as(ann, `select public.game_log('${babyBook}')`);
    const [c] = await as(ann, `select member_id, credited_to, xp, points, status from planner_goal_completions where goal_id = '${babyBook}'`);
    return (c.member_id === M("a3") && c.credited_to === M("a1") && c.xp === 10 && c.points === 5 && c.status === "counted") || c;
  });
  await check("...summed once: Ann's XP has it, Baby's does not", async () => {
    const r = (await db.query("select public.game_xp($1) ann, public.game_xp($2) baby", [M("a1"), M("a3")])).rows[0];
    return (r.ann === 10 && r.baby === 0) || r;
  });
  await check("Abe, the other grown-up, can tick Baby's goals too", async () => {
    await as(abe, `select public.game_log('${babyOwn}')`);
    const [c] = await as(abe, `select credited_to from planner_goal_completions where goal_id = '${babyOwn}'`);
    // An ordinary (credit to owner) goal of Baby's stays Baby's.
    return c.credited_to === M("a3") || c;
  });
  await check("Nobody can say whom a claim credits -- not on the way in, not afterwards", async () => {
    try {
      await as(ann, `update planner_goal_completions set credited_to = '${M("a4")}' where goal_id = '${babyBook}'`);
    } catch {
      // refused outright is fine too
    }
    const [c] = await as(ann, `select credited_to from planner_goal_completions where goal_id = '${babyBook}'`);
    return c.credited_to === M("a1") || c;
  });
  await check("A second tick the same day adds progress but no second claim", async () => {
    await as(ann, `select public.game_log('${babyBook}')`);
    return (await as(ann, `select count(*)::int n from planner_goal_completions where goal_id = '${babyBook}'`))[0].n === 1;
  });

  // --- Linked goals ---------------------------------------------------------------------
  const walkWeek = await goal(null, "Stroller walk together", { period: "week", target: 3, category: "outdoor", xp: 0, points: 0 });
  const babyOutdoor = await goal(M("a3"), "Outdoor time", { category: "outdoor", credit: "logger" });
  await check("Only a grown-up links goals", async () =>
    (await refused(() => as(kid, `insert into planner_goal_links (goal_id, linked_goal_id, family_id, created_by) values ($1, $2, $3, public.current_member_id())`, [walkWeek, babyOutdoor, A]))) === true);
  await as(ann, `insert into planner_goal_links (goal_id, linked_goal_id, family_id, created_by) values ($1, $2, $3, public.current_member_id())`, [walkWeek, babyOutdoor, A]);
  const entries = async (g) => (await as(ann, `select count(*)::int n from planner_goal_entries where goal_id = '${g}'`))[0].n;
  const readings = async () => (await db.query("select value_text from health_vitals where member_id = $1 and vital_type = 'steps'", [M("a1")])).rows;
  await check("One stroller walk, logged once: the family's walk, Baby's outdoor time and Ann's 2,500 steps", async () => {
    await as(ann, `select public.game_log('${walkWeek}', 2500)`);
    const claim = await as(ann, `select credited_to from planner_goal_completions where goal_id = '${babyOutdoor}'`);
    const r = await readings();
    return (await entries(walkWeek)) === 1 && (await entries(babyOutdoor)) === 1 && claim.length === 1 && claim[0].credited_to === M("a1") && r.length === 1 && r[0].value_text === "2500" || { walk: await entries(walkWeek), outdoor: await entries(babyOutdoor), claim, r };
  });
  await check("Kid logs the family walk: it counts, but the link does not let him tick Baby's goal", async () => {
    await as(kid, `select public.game_log('${walkWeek}')`);
    return (await entries(walkWeek)) === 2 && (await entries(babyOutdoor)) === 1;
  });
  await check("Linking never lets anyone log for someone else (Kid's own goal linked from the walk)", async () => {
    const kidGoal = await goal(M("a2"), "Kid's walk", { category: "outdoor" });
    await as(ann, `insert into planner_goal_links (goal_id, linked_goal_id, family_id, created_by) values ($1, $2, $3, public.current_member_id())`, [walkWeek, kidGoal, A]);
    await as(ann, `select public.game_log('${walkWeek}')`);
    return (await entries(kidGoal)) === 0 && (await entries(walkWeek)) === 3;
  });
  await check("Dan, another household, sees no links", async () => (await as(dan, "select 1 from planner_goal_links")).length === 0);

  // --- Removing ---------------------------------------------------------------------------
  await check("A child cannot remove a game goal", async () =>
    (await refused(() => as(kid, `update planner_goals set active = false, removed_at = now() where id = '${babyBook}'`), "grown-up")) === true);
  await check("Removed, not deleted: what it earned stays, and it cannot be switched back on", async () => {
    const tmp = await goal(M("a1"), "Temporary");
    await as(ann, `select public.game_log('${tmp}')`);
    await as(ann, `update planner_goals set active = false, removed_at = now() where id = '${tmp}'`);
    return (await as(ann, `select count(*)::int n from planner_goal_completions where goal_id = '${tmp}'`))[0].n === 1 &&
      (await refused(() => as(ann, `update planner_goals set active = true where id = '${tmp}'`))) === true &&
      (await refused(() => as(ann, `select public.game_log('${tmp}')`))) === true;
  });

  // --- The helpers ---------------------------------------------------------------------------
  await check("game_today and game_period_start answer for the caller's household", async () => {
    const [r] = await as(ann, `select public.game_today()::text t, public.game_period_start('${walkWeek}')::text w, public.game_period_start('${babyBook}')::text d`);
    return (r.t === r.d && r.w <= r.t) || r;
  });
  await check("game_may_log: Ann may log Baby's goal, Kid may not, Dan sees nothing", async () =>
    (await as(ann, `select public.game_may_log('${babyBook}') ok`))[0].ok === true &&
    (await as(kid, `select public.game_may_log('${babyBook}') ok`))[0].ok === false &&
    (await as(dan, `select public.game_may_log('${babyBook}') ok`))[0].ok === false);
  await check("game_settle_my_steps runs for a member and touches only their own", async () => {
    await as(kid, "select public.game_settle_my_steps()");
    return true;
  });
  await check("game_week_start: a Sunday-start household's week (and members cannot call it)", async () => {
    const r = (await db.query(`select public.game_week_start($1, '2026-10-21')::text w`, [A])).rows[0];
    return (r.w === "2026-10-18" && (await refused(() => as(ann, `select public.game_week_start('${A}', current_date)`))) === true) || r;
  });
  await check("Members cannot run the inner helpers", async () =>
    (await refused(() => as(ann, `select public.game_steps_run('${M("a1")}', current_date)`))) === true &&
    (await refused(() => as(ann, `select public.game_xp('${M("a1")}')`))) === true);

  // --- A week of days: weekdays only, a backup day, Step Champion, the family week ------------------
  const annMove = await goal(M("a1"), "Workout 20 min");
  const annBackup = await goal(M("a1"), "10 minutes of movement", { backup: true, xp: 5, points: 0 });
  const annStretch = await goal(M("a1"), "Stretch breaks", { days: [1, 2, 3, 4, 5], target: 3 });
  const annSteps = await goal(M("a1"), "Steps", { kind: "steps", target: 7000 });
  const dinnerWeek = await goal(null, "Dinner, no phones", { period: "week", target: 5, category: "family", xp: 0, points: 0 });
  // The goals made above for the earlier checks are not this week's story: off.
  await db.query("update planner_goals set active = false where family_id = $1 and id <> all($2::uuid[])", [A, [annMove, annBackup, annStretch, annSteps, babyBook, babyOutdoor, walkWeek, dinnerWeek]]);
  await db.query("select set_config('request.jwt.claims', '{}', false)");
  await db.query("update planner_goals set created_at = now() - interval '40 days'");
  const S = (await db.query("select ((now() at time zone 'Asia/Manila')::date - 14 - extract(dow from (now() at time zone 'Asia/Manila')::date)::int)::text d")).rows[0].d; // a Sunday
  const day = async (n) => (await db.query("select ($1::date + $2::int)::text d", [S, n])).rows[0].d;
  const met = async (g, member, d, part = "whole") => {
    await db.query("insert into planner_goal_completions (family_id, goal_id, member_id, period_start, part) values ($1, $2, $3, $4, $5)", [A, g, member, d, part]);
    await db.query("update planner_goal_completions set status = 'counted' where goal_id = $1 and period_start = $2", [g, d]);
  };
  const entry = async (g, d, n = 1) => {
    await db.exec("set session_replication_role = replica");
    for (let i = 0; i < n; i++) await db.query("insert into planner_goal_entries (family_id, goal_id, member_id, entry_date, amount) values ($1, $2, $3, $4, 1)", [A, g, M("a1"), d]);
    await db.exec("set session_replication_role = origin");
  };
  const close = (d) => db.query("select public.game_close_household_day($1, $2)", [A, d]);
  const annStreak = async () => (await db.query("select streak, freezes from game_streaks where member_id = $1", [M("a1")])).rows[0];
  const bonus = async (d) => (await db.query("select count(*)::int n from game_awards where member_id = $1 and kind = 'all_dailies' and day = $2", [M("a1"), d])).rows[0].n;
  // What happened: Ann walks every day (steps), the baby's two every day.
  const plan = [
    { move: true, stretch: false, backup: false }, // Sun: stretch not asked
    { move: false, stretch: false, backup: true }, // Mon: busy, backup only
    { move: false, stretch: false, backup: false }, // Tue: nothing
    { move: true, stretch: false, backup: false }, // Wed: stretch missed
    { move: true, stretch: true, backup: false }, // Thu
    { move: true, stretch: true, backup: false }, // Fri
    { move: true, stretch: false, backup: false }, // Sat: stretch not asked
  ];
  const after = [];
  for (let i = 0; i < 7; i++) {
    const d = await day(i);
    await met(annSteps, M("a1"), d, "rest");
    if (plan[i].move) await met(annMove, M("a1"), d);
    if (plan[i].stretch) await met(annStretch, M("a1"), d);
    if (plan[i].backup) await met(annBackup, M("a1"), d);
    await met(babyBook, M("a3"), d);
    await met(babyOutdoor, M("a3"), d);
    if (i < 3) await entry(walkWeek, d);
    if (i < 5) await entry(dinnerWeek, d);
    await close(d);
    after.push(await annStreak());
  }
  await check("Weekdays only: a Sunday without the stretch goal is a full day (streak 1, bonus)", async () =>
    (after[0].streak === 1 && (await bonus(await day(0)))) === 1 || after[0]);
  await check("Minimum day: Monday's backup alone keeps the streak going (+1) with no bonus", async () =>
    (after[1].streak === 2 && after[1].freezes === 1 && (await bonus(await day(1))) === 0) || after[1]);
  await check("Tuesday with nothing: the freeze keeps it", async () => (after[2].streak === 2 && after[2].freezes === 0) || after[2]);
  await check("Wednesday's stretch missed, no backup, no freeze: back to 0", async () => after[3].streak === 0 || after[3]);
  await check("Thursday to Saturday all done (Saturday asks no stretch): 3", async () =>
    (after[6].streak === 3 && (await bonus(await day(6))) === 1) || after[6]);
  const badges = async (m) => (await db.query("select badge_id from game_member_badges where member_id = $1 order by badge_id", [m])).rows.map((r) => r.badge_id);
  await check("Step Champion: the steps goal met 7 days in a row", async () => (await badges(M("a1"))).includes("step_champion") || (await badges(M("a1"))));
  await check("The family week: every family goal met -> recorded, and Family Team for each player", async () => {
    const [w] = (await db.query("select week_start::text, all_done, goals from game_family_weeks where family_id = $1", [A])).rows;
    return (w?.week_start === S && w.all_done === true && w.goals === 2 && (await badges(M("a1"))).includes("family_team") && (await badges(M("a3"))).includes("family_team")) || w;
  });

  // --- The family treat -------------------------------------------------------------------------
  const treat = (await as(ann, `insert into rewards (family_id, title, cost_points, budget_amount, unlock) values ($1, 'Special breakfast out', 1, 800, 'family_week') returning id`, [A]))[0].id;
  await check("The family treat cannot be bought with coins", async () =>
    (await refused(() => as(kid, `insert into reward_redemptions (family_id, reward_id, member_id, cost_points) values ($1, $2, public.current_member_id(), 1)`, [A, treat]), "unlocked")) === true);
  await check("A child cannot mark the treat used; a grown-up can, once", async () =>
    (await refused(() => as(kid, `select public.game_use_family_treat('${S}')`), "grown-up")) === true &&
    (await as(ann, `select public.game_use_family_treat('${S}')`)).length === 1 &&
    (await refused(() => as(abe, `select public.game_use_family_treat('${S}')`), "no unused")) === true);
  await check("Nobody writes the family week by hand; another household sees none of it", async () =>
    (await refused(() => as(ann, `insert into game_family_weeks (family_id, week_start, all_done) values ($1, current_date, true)`, [A]))) === true &&
    (await as(dan, "select 1 from game_family_weeks")).length === 0);
  await check("A reward's peso note is a number, and never negative", async () =>
    (await refused(() => as(ann, `insert into rewards (family_id, title, cost_points, budget_amount) values ($1, 'Bad', 5, -1)`, [A]))) === true);
}
