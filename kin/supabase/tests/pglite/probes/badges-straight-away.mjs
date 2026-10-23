// Badges the moment they are earned (20261023140000, Jonathan 23 October):
// a counted completion gives the badges its rule allows there and then -- a
// grown-up's claim at once, a child's only once a grown-up says yes -- the
// family streak once every player has finished today; nobody but the trigger
// can hand them out.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1");
  const today = (await db.query("select (now() at time zone 'Asia/Manila')::date::text as d")).rows[0].d;
  const yesterday = (await db.query("select ($1::date - 1)::text as d", [today])).rows[0].d;
  const game = async (owner, title, category) =>
    (await as(ann, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, created_by) values ($1, $2, 'custom', $3, 'day', 1, $4, 10, 5, public.current_member_id()) returning id`, [A, title, owner, category]))[0].id;
  const claim = (who, goal, member) =>
    as(who, `insert into planner_goal_completions (family_id, goal_id, member_id, period_start, xp, points, status) values ($1, $2, $3, $4, 0, 0, 'counted') returning id, status`, [A, goal, member, today]);
  const badges = async (m) => (await db.query("select badge_id, earned_on::text as on from game_member_badges where member_id = $1 order by badge_id", [m])).rows;
  const has = async (m, id) => (await badges(m)).some((b) => b.badge_id === id && b.on === today);

  await db.query("update families set time_zone = 'Asia/Manila' where id = $1", [A]);
  // Made before today, so today's dailies count them.
  const annWater = await game(M("a1"), "Water", "water");
  const kidWater = await game(M("a2"), "Water", "water");
  await db.query("update planner_goals set created_at = now() - interval '10 days' where id in ($1, $2)", [annWater, kidWater]);

  // Nine met before (history written straight in), and two days of streak
  // already closed for each, the family's too.
  for (let i = 1; i <= 9; i++) {
    await db.query("insert into planner_goal_completions (family_id, goal_id, member_id, period_start, xp, points, status) values ($1, $2, $3, $4::date - $5::int, 10, 5, 'counted')", [A, annWater, M("a1"), today, i]);
  }
  await db.query("delete from game_member_badges where family_id = $1", [A]);
  for (const m of [M("a1"), M("a2")]) {
    await db.query("insert into game_streaks (member_id, family_id, streak, best_streak, last_day) values ($1, $2, 2, 2, $3) on conflict (member_id) do update set streak = 2, best_streak = 2, last_day = $3", [m, A, yesterday]);
  }
  await db.query("insert into game_family_streaks (family_id, streak, best_streak, last_day) values ($1, 2, 2, $2) on conflict (family_id) do update set streak = 2, best_streak = 2, last_day = $2", [A, yesterday]);

  await check("Before today's claim Ann has no badge", async () => (await badges(M("a1"))).length === 0 || (await badges(M("a1"))));
  await claim(ann, annWater, M("a1"));
  await check("Ann's tenth goal met: 'Ten done' straight away, dated today", async () => (await has(M("a1"), "done_10")) || (await badges(M("a1"))));
  await check("Ann's dailies all met on top of two closed days: the 3-day badge straight away", async () => (await has(M("a1"), "streak_3")) || (await badges(M("a1"))));
  await check("Not the family badge yet: Kid has not finished today", async () => !(await has(M("a1"), "family_3")));

  const [kidClaim] = await claim(kid, kidWater, M("a2"));
  await check("Kid's own claim waits for a grown-up, and gives no badge while it waits", async () =>
    (kidClaim.status === "pending" && !(await has(M("a2"), "streak_3"))) || { kidClaim, badges: await badges(M("a2")) });
  await check("Kid cannot hand himself a badge", async () =>
    (await refused(() => as(kid, `select public.game_badges_now('${M("a2")}', '${A}')`))) === true &&
    (await refused(() => as(kid, `insert into game_member_badges (member_id, badge_id, family_id, earned_on) values ('${M("a2")}', 'streak_3', '${A}', current_date)`))) === true);
  await check("Nobody calls the helpers directly: game_day_so_far, the trigger's planner_goal_completions_badges", async () =>
    (await refused(() => as(kid, `select * from public.game_day_so_far('${M("a2")}', '${A}', current_date, 'Asia/Manila')`))) === true &&
    (await refused(() => as(dan, `select * from public.game_day_so_far('${M("a1")}', '${A}', current_date, 'Asia/Manila')`))) === true &&
    (await refused(() => as(ann, "select public.planner_goal_completions_badges()"))) === true);
  await check("Dan, another household, cannot call it for House A", async () =>
    (await refused(() => as(dan, `select public.game_badges_now('${M("a1")}', '${A}')`))) === true);

  await as(ann, `update planner_goal_completions set status = 'counted', decided_by = public.current_member_id() where id = '${kidClaim.id}'`);
  await check("Ann says yes: Kid's 3-day badge arrives then", async () => (await has(M("a2"), "streak_3")) || (await badges(M("a2"))));
  await check("Everyone finished today: 'Team of us' for both players straight away", async () =>
    ((await has(M("a1"), "family_3")) && (await has(M("a2"), "family_3"))) || { ann: await badges(M("a1")), kid: await badges(M("a2")) });

  await check("The day's close later gives nothing twice", async () => {
    const before = (await db.query("select count(*)::int as n from game_member_badges where family_id = $1", [A])).rows[0].n;
    await db.query("select public.game_close_household_day($1, $2)", [A, today]);
    const after = (await db.query("select count(*)::int as n from game_member_badges where family_id = $1", [A])).rows[0].n;
    return after === before || { before, after };
  });
}
