// Goals and Rewards as a game (20261020120000, Janine 20 October): only a
// grown-up sets up a game goal; a "+" is today's and the caller's own, or a
// grown-up's for a child with no login; a claim's XP comes from the goal;
// nobody writes XP, coins, streaks or badges but the nightly job, which
// nobody can call; and the job's day -- streaks, freezes, bonuses, badges --
// pays once however often it runs.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const today = (await db.query("select (now() at time zone 'Asia/Manila')::date::text as d")).rows[0].d;
  const game = async (who, owner, title, extra = {}) =>
    (await as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, public.current_member_id()) returning id`, [A, title, extra.kind ?? "custom", owner, extra.period ?? "day", extra.target ?? 3, extra.category ?? "water", extra.xp ?? 10, extra.points ?? 5]))[0].id;
  const tap = (who, goal, day = today) => as(who, `insert into planner_goal_entries (family_id, goal_id, entry_date, amount) values ($1, $2, $3, 1) returning member_id`, [A, goal, day]);
  const claim = (who, goal, member, day = today) =>
    as(who, `insert into planner_goal_completions (family_id, goal_id, member_id, period_start, xp, points, status) values ($1, $2, $3, $4, 999, 999, 'counted') returning xp, points, status`, [A, goal, member, day]);

  // --- Setting up -----------------------------------------------------------
  await check("A child cannot set up a game goal, even their own", async () =>
    (await refused(() => game(kid, M("a2"), "Mine"), "grown-up")) === true);
  const kidWater = await game(ann, M("a2"), "Water");
  const babyBrush = await game(ann, M("a3"), "Brush teeth", { category: "hygiene", target: 2 });
  const annMove = await game(abe, M("a1"), "Walk", { category: "move" });
  await check("A grown-up sets one up for anyone in the house", async () => !!kidWater && !!babyBrush && !!annMove);
  await check("A child cannot change, pause or remove their game goal", async () =>
    (await refused(() => as(kid, `update planner_goals set title = 'x' where id = '${kidWater}'`), "grown-up")) === true &&
    (await refused(() => as(kid, `update planner_goals set active = false where id = '${kidWater}'`), "grown-up")) === true &&
    (await refused(() => as(kid, `delete from planner_goals where id = '${kidWater}'`), "grown-up")) === true);
  await check("A child cannot turn an ordinary goal into a game goal, or give it XP", async () => {
    const own = (await as(kid, `insert into planner_goals (family_id, title, kind, owner_member_id, period, created_by) values ($1, 'Read', 'custom', $2, 'day', public.current_member_id()) returning id`, [A, M("a2")]))[0].id;
    return (await refused(() => as(kid, `update planner_goals set category = 'water' where id = '${own}'`), "grown-up")) === true &&
      (await refused(() => as(kid, `update planner_goals set xp = 50 where id = '${own}'`))) === true;
  });
  await check("Habits only: a weight or money goal can never be a game goal", async () =>
    (await refused(() => game(ann, M("a1"), "Weight", { kind: "weight", period: "total" }))) === true &&
    (await refused(() => game(ann, M("a1"), "Save", { kind: "money", period: "total" }))) === true);
  await check("No XP on a household goal (nobody to give it to)", async () =>
    (await refused(() => game(ann, null, "Family walk", { points: 0, xp: 10 }))) === true &&
    !!(await game(ann, null, "Family walk", { points: 0, xp: 0, category: "family" })));

  // --- The "+" ----------------------------------------------------------------
  await check("Kid taps + on his own goal, today; the entry is his", async () =>
    (await tap(kid, kidWater))[0].member_id === M("a2"));
  await check("...but not for yesterday", async () =>
    (await refused(() => tap(kid, kidWater, "2020-01-01"), "today")) === true);
  await check("Ann taps + for Baby (no login); it is recorded as Ann's tap", async () =>
    (await tap(ann, babyBrush))[0].member_id === M("a1"));
  await check("Kid cannot tap for Baby, nor for Ann", async () =>
    (await refused(() => tap(kid, babyBrush), "Only the person")) === true &&
    (await refused(() => tap(kid, annMove), "Only the person")) === true);
  await check("Abe (a grown-up) cannot tap for Kid, who has a login", async () =>
    (await refused(() => tap(abe, kidWater), "Only the person")) === true);
  await check("Ben, another household, cannot tap for Baby", async () =>
    (await refused(() => tap(ben, babyBrush))) === true);
  await check("Kid cannot take back Ann's tap for Baby", async () =>
    (await as(kid, `select count(*)::int n from planner_goal_entries where goal_id = '${babyBrush}'`))[0].n === 1 &&
    (await refused(() => as(kid, `delete from planner_goal_entries where goal_id = '${babyBrush}'`), "Only the person")) === true);

  // --- Claims ------------------------------------------------------------------
  await check("Ann claims for Baby: counts at once, XP and coins from the goal (not the 999 sent)", async () => {
    const [r] = await claim(ann, babyBrush, M("a3"));
    return (r.xp === 10 && r.points === 5 && r.status === "counted") || r;
  });
  await check("Kid's own claim waits for a grown-up, worth the goal's XP", async () => {
    const [r] = await claim(kid, kidWater, M("a2"));
    return (r.xp === 10 && r.status === "pending") || r;
  });
  await check("Kid cannot say yes to his own claim (no XP for himself)", async () =>
    (await as(kid, `update planner_goal_completions set status = 'counted', decided_by = public.current_member_id() where goal_id = '${kidWater}' returning id`)).length === 0);
  await check("Nobody claims for a child who has a login, or for another house", async () =>
    (await refused(() => claim(abe, kidWater, M("a2"), "2020-01-01"))) === true &&
    (await refused(() => claim(ben, babyBrush, M("a3")))) === true);
  await check("A paused goal takes no taps and no claims", async () => {
    await as(ann, `update planner_goals set active = false where id = '${annMove}'`);
    const r = (await refused(() => tap(ann, annMove), "paused")) === true && (await refused(() => claim(ann, annMove, M("a1")))) === true;
    await as(ann, `update planner_goals set active = true where id = '${annMove}'`);
    return r;
  });

  // --- Nobody writes the game's history ------------------------------------------
  await check("Kid cannot write awards, badges or streaks", async () =>
    (await refused(() => as(kid, `insert into game_awards (family_id, member_id, day, kind, xp, points) values ($1, $2, current_date, 'all_dailies', 1000, 1000)`, [A, M("a2")]))) === true &&
    (await refused(() => as(kid, `insert into game_member_badges (member_id, badge_id, family_id, earned_on) values ($1, 'streak_100', $2, current_date)`, [M("a2"), A]))) === true &&
    (await refused(() => as(kid, `update game_streaks set streak = 100`))) === true &&
    (await refused(() => as(kid, `insert into game_badges (id, title, icon, description, rule, threshold) values ('x','x','x','x','level',1)`))) === true);
  await check("Neither can a grown-up", async () =>
    (await refused(() => as(ann, `insert into game_awards (family_id, member_id, day, kind, xp, points) values ($1, $2, current_date, 'all_dailies', 5, 5)`, [A, M("a1")]))) === true);
  await check("Members cannot run the end-of-day job", async () =>
    (await refused(() => as(kid, "select public.close_game_day()"))) === true &&
    (await refused(() => as(ann, "select public.close_game_day()"))) === true &&
    (await refused(() => as(ann, `select public.game_close_household_day('${A}', current_date - 1)`))) === true);
  await check("Kid cannot grant his own reward request", async () => {
    const reward = (await as(ann, `insert into rewards (family_id, title, cost_points) values ($1, 'Ice cream', 5) returning id`, [A]))[0].id;
    await as(kid, `insert into reward_redemptions (family_id, reward_id, member_id, cost_points) values ($1, $2, public.current_member_id(), 5)`, [A, reward]);
    return (await refused(() => as(kid, `update reward_redemptions set status = 'granted' where reward_id = '${reward}'`))) === true;
  });

  // --- The end of the day ----------------------------------------------------------
  // Three players -- Ann, Kid (two dailies) and Baby; Abe has none, so he is
  // not one. Friday, Saturday and Sunday of a week a fortnight back.
  const kidRead = await game(ann, M("a2"), "Read", { category: "family", target: 1 });
  await db.query("select set_config('request.jwt.claims', '{}', false)");
  await db.query("update planner_goals set created_at = now() - interval '40 days'");
  const sunday = (await db.query("select ((now() at time zone 'Asia/Manila')::date - 14 - extract(isodow from (now() at time zone 'Asia/Manila')::date)::int % 7)::text as d")).rows[0].d;
  const day = async (n) => (await db.query(`select ($1::date + $2::int)::text as d`, [sunday, n])).rows[0].d;
  const [fri, sat, sun] = [await day(-2), await day(-1), sunday];
  const met = async (goal, member, d) => {
    await db.query("insert into planner_goal_completions (family_id, goal_id, member_id, period_start) values ($1, $2, $3, $4)", [A, goal, member, d]);
    await db.query("update planner_goal_completions set status = 'counted' where goal_id = $1 and period_start = $2", [goal, d]);
  };
  const close = (d) => db.query(`select public.game_close_household_day($1, $2)`, [A, d]);
  const streak = async (m) => (await db.query("select streak, best_streak, freezes from game_streaks where member_id = $1", [m])).rows[0];
  const awards = async (kind, d) => (await db.query("select count(*)::int n from game_awards where kind = $1 and day = $2", [kind, d])).rows[0].n;
  const family = async () => (await db.query("select streak from game_family_streaks where family_id = $1", [A])).rows[0]?.streak;

  for (const [g, m] of [[annMove, M("a1")], [kidWater, M("a2")], [kidRead, M("a2")], [babyBrush, M("a3")]]) await met(g, m, fri);
  await close(fri);
  await check("Friday, all done: each player's streak is 1, Abe (no dailies) is not a player", async () =>
    (await streak(M("a1"))).streak === 1 && (await streak(M("a2"))).streak === 1 && (await streak(M("a3"))).streak === 1 && (await streak(M("a4"))) === undefined);
  await check("...all-dailies bonus once each (20 XP, 10 coins), whole-family bonus to all three", async () =>
    (await awards("all_dailies", fri)) === 3 && (await awards("whole_family", fri)) === 3 &&
    (await db.query("select xp, points from game_awards where kind = 'all_dailies' limit 1")).rows[0].xp === 20 && (await family()) === 1);
  await close(fri);
  await db.query("select public.game_close_household_day($1, $2)", [A, fri]);
  await check("Closing Friday again pays nothing twice", async () =>
    (await awards("all_dailies", fri)) === 3 && (await awards("whole_family", fri)) === 3 && (await streak(M("a1"))).streak === 1);

  // Saturday: Kid does one of his two.
  for (const [g, m] of [[annMove, M("a1")], [kidWater, M("a2")], [babyBrush, M("a3")]]) await met(g, m, sat);
  await close(sat);
  await check("Saturday, Kid half done: his freeze keeps his streak", async () => {
    const s = await streak(M("a2"));
    return (s.streak === 1 && s.freezes === 0) || s;
  });
  await check("...no whole-family bonus, family streak back to 0; Ann and Baby still get theirs", async () =>
    (await awards("whole_family", sat)) === 0 && (await family()) === 0 && (await awards("all_dailies", sat)) === 2 && (await streak(M("a1"))).streak === 2);

  // Sunday: Kid does nothing, and has no freeze left.
  for (const [g, m] of [[annMove, M("a1")], [babyBrush, M("a3")]]) await met(g, m, sun);
  await close(sun);
  await check("Sunday, Kid misses with no freeze: streak back to 0, best stays 1", async () => {
    const s = await streak(M("a2"));
    return (s.streak === 0 && s.best_streak === 1) || s;
  });
  await check("...and at the end of Sunday every freeze is refilled", async () =>
    (await streak(M("a2"))).freezes === 1 && (await streak(M("a1"))).freezes === 1);
  await check("Ann and Baby reach 3 days: the 3-day badge, and Kid has none", async () => {
    const r = (await db.query("select member_id, badge_id from game_member_badges where badge_id = 'streak_3' order by member_id")).rows;
    return (r.length === 2 && r[0].member_id === M("a1") && r[1].member_id === M("a3")) || r;
  });
  await check("Ann's XP is summed from history: 3 claims x 10 + 3 x 20 + 30 = 120, level 2 and its badge", async () => {
    const x = (await db.query("select public.game_xp($1) xp, public.game_level(public.game_xp($1)) lvl", [M("a1")])).rows[0];
    const badge = (await db.query("select 1 from game_member_badges where member_id = $1 and badge_id = 'level_2'", [M("a1")])).rows.length;
    return (x.xp === 120 && x.lvl === 2 && badge === 1) || { ...x, badge };
  });
  await check("Levels: 99 XP is 1, 100 is 2, 249 is 2, 250 is 3, 450 is 4", async () => {
    const r = (await db.query("select public.game_level(99) a, public.game_level(100) b, public.game_level(249) c, public.game_level(250) d, public.game_level(450) e")).rows[0];
    return (r.a === 1 && r.b === 2 && r.c === 2 && r.d === 3 && r.e === 4) || r;
  });

  await check("The hourly job closes each missed day once, and running it twice adds nothing", async () => {
    await db.query("select public.close_game_day()");
    const once = (await db.query("select count(*)::int n from game_days where family_id = $1", [A])).rows[0].n;
    await db.query("select public.close_game_day()");
    const twice = (await db.query("select count(*)::int n from game_days where family_id = $1", [A])).rows[0].n;
    return (once === twice && once > 3) || { once, twice };
  });

  // --- Who sees it ------------------------------------------------------------------
  await check("Kid sees his household's streaks, awards and badges", async () =>
    (await as(kid, "select 1 from game_streaks")).length >= 3 && (await as(kid, "select 1 from game_awards")).length > 0 && (await as(kid, "select 1 from game_member_badges")).length > 0);
  await check("Dan, another household, sees none of it (but the badge catalog)", async () =>
    (await as(dan, "select 1 from game_streaks")).length === 0 && (await as(dan, "select 1 from game_awards")).length === 0 &&
    (await as(dan, "select 1 from game_member_badges")).length === 0 && (await as(dan, "select 1 from game_family_streaks")).length === 0 &&
    (await as(dan, "select 1 from game_days")).length === 0 && (await as(dan, "select 1 from game_badges")).length > 10);
}
