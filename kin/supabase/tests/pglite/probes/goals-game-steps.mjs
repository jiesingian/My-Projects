// Steps in the goals game (20261020150000, Janine 20 October): a steps game
// goal is claimed in halves -- half the XP and coins at 50%, the rest at
// 100% -- and every other goal still whole; only steps a person typed for
// themselves (or a grown-up for a child with no login), or that a sync sent,
// count; the nightly job settles steps nobody claimed, so synced steps earn
// too; and the week's family steps pay every player 50 XP and 25 coins, once.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1");
  const today = (await db.query("select (now() at time zone 'Asia/Manila')::date::text as d")).rows[0].d;
  const goal = async (who, owner, extra = {}) =>
    (await as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, created_by) values ($1, 'Steps', $2, $3, $4, $5, $6, $7, $8, public.current_member_id()) returning id`, [A, extra.kind ?? "steps", owner, extra.period ?? "day", extra.target ?? 6000, extra.category ?? "move", extra.xp ?? 15, extra.points ?? 5]))[0].id;
  const claim = (who, goalId, member, part, day = today) =>
    as(who, `insert into planner_goal_completions (family_id, goal_id, member_id, period_start, part, xp, points) values ($1, $2, $3, $4, $5, 999, 999) returning xp, points, status`, [A, goalId, member, day, part]);
  const reading = (member, day, value, source, createdBy) =>
    db.query("insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, source, created_by) values ($1, $2, 'steps', $3, $4, 'steps', $5, $6)", [A, member, day, String(value), source, createdBy]);

  // --- Setting up ------------------------------------------------------------
  await check("A child cannot set up a steps game goal", async () => (await refused(() => goal(kid, M("a2")), "grown-up")) === true);
  const kidSteps = await goal(ann, M("a2"));
  const babySteps = await goal(ann, M("a3"), { target: 4000, xp: 10, points: 6 });
  await check("A grown-up sets one per person, each with their own target", async () => !!kidSteps && !!babySteps);
  await check("Daily steps are a person's; the weekly total is the household's", async () =>
    (await refused(() => goal(ann, null, { period: "day", xp: 0, points: 0 }))) === true &&
    (await refused(() => goal(ann, M("a1"), { period: "week", xp: 0, points: 0 }))) === true);
  const familyWeek = await goal(ann, null, { period: "week", target: 10000, category: "family", xp: 0, points: 0 });

  // --- Partial credit ------------------------------------------------------------
  await check("A steps game goal is never claimed whole", async () =>
    (await refused(() => claim(kid, kidSteps, M("a2"), "whole"), "halves")) === true);
  await check("...and a tap goal is never claimed in halves", async () => {
    const water = (await as(ann, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, created_by) values ($1, 'Water', 'custom', $2, 'day', 6, 'water', 10, 5, public.current_member_id()) returning id`, [A, M("a1")]))[0].id;
    return (await refused(() => claim(ann, water, M("a1"), "half"), "halves")) === true;
  });
  await check("At 50%: half the XP and coins, rounded down (15 XP -> 7, 5 coins -> 2), whatever the client sent", async () => {
    const [r] = await claim(kid, kidSteps, M("a2"), "half");
    return (r.xp === 7 && r.points === 2 && r.status === "pending") || r;
  });
  await check("At 100%: the rest (8 XP, 3 coins) -- the two make the whole", async () => {
    const [r] = await claim(kid, kidSteps, M("a2"), "rest");
    return (r.xp === 8 && r.points === 3) || r;
  });
  await check("Each half only once a day", async () => (await refused(() => claim(kid, kidSteps, M("a2"), "half"))) === true);
  await check("Ann claims Baby's (no login) half: counted at once", async () => {
    const [r] = await claim(ann, babySteps, M("a3"), "half");
    return (r.xp === 5 && r.points === 3 && r.status === "counted") || r;
  });
  await check("Kid cannot claim Baby's steps", async () => (await refused(() => claim(kid, babySteps, M("a3"), "rest"))) === true);

  // --- Whose steps count -----------------------------------------------------------
  const d = (await db.query("select ((now() at time zone 'Asia/Manila')::date - 7 - ((extract(isodow from (now() at time zone 'Asia/Manila')::date)::int + 4) % 7))::text as d")).rows[0].d; // a Wednesday, a week or more back
  const steps = async (member, day) => (await db.query("select public.game_steps($1, $2) n", [member, day])).rows[0].n;
  await reading(M("a2"), d, 2500, "manual", M("a2"));
  await reading(M("a2"), d, 3500, "apple_health", M("a2"));
  await check("A day's steps: the larger source, never the sum (2,500 typed, 3,500 synced -> 3,500)", async () => (await steps(M("a2"), d)) === 3500);
  await reading(M("a3"), d, 9000, "manual", M("a2"));
  await check("Kid typing steps in for Baby counts for nobody", async () => (await steps(M("a3"), d)) === 0);
  await reading(M("a3"), d, 4100, "manual", M("a1"));
  await check("Ann (a grown-up) typing them for Baby counts", async () => (await steps(M("a3"), d)) === 4100);
  await reading(M("a2"), d, 50000, "manual", M("a4"));
  await check("Abe typing for Kid (who has a login) does not count", async () => (await steps(M("a2"), d)) === 3500);

  // --- The night settles it -----------------------------------------------------------
  await db.query("select set_config('request.jwt.claims', '{}', false)");
  await db.query("update planner_goals set created_at = now() - interval '40 days'");
  await db.query("select public.game_close_household_day($1, $2)", [A, d]);
  const parts = async (g, day) => (await db.query("select part, status, xp from planner_goal_completions where goal_id = $1 and period_start = $2 order by part", [g, day])).rows;
  await check("Baby reached 4,100 of 4,000: the job settles both halves, counted", async () => {
    const r = await parts(babySteps, d);
    return (r.length === 2 && r.every((x) => x.status === "counted") && r[0].xp + r[1].xp === 10) || r;
  });
  await check("Kid reached 3,500 of 6,000: only the half, waiting for a grown-up (he has a login)", async () => {
    const r = await parts(kidSteps, d);
    return (r.length === 1 && r[0].part === "half" && r[0].status === "pending") || r;
  });
  await check("Half isn't done: Kid's streak does not grow; Baby's all-the-way day does", async () => {
    const s = (await db.query("select member_id, streak from game_streaks where member_id in ($1, $2) order by member_id", [M("a2"), M("a3")])).rows;
    return (s[0].streak === 0 && s[1].streak === 1) || s;
  });

  // --- The week's family steps -----------------------------------------------------------
  const famAwards = async () => (await db.query("select member_id, xp, points, day::text from game_awards where kind = 'family_steps' order by member_id")).rows;
  await check("Wednesday: 3,500 + 4,100 = 7,600 of 10,000 -- no family bonus yet", async () => (await famAwards()).length === 0);
  const thu = (await db.query("select ($1::date + 1)::text d", [d])).rows[0].d;
  await reading(M("a1"), thu, 3000, "manual", M("a1"));
  await db.query("select public.game_close_household_day($1, $2)", [A, thu]);
  await check("Thursday takes the week past 10,000: 50 XP and 25 coins to everyone with a game goal", async () => {
    const r = await famAwards();
    // Ann (her water goal), Kid and Baby; Abe has no game goal.
    return (r.length === 3 && r.every((x) => x.xp === 50 && x.points === 25) && !r.some((x) => x.member_id === M("a4"))) || r;
  });
  await check("...dated the week's first day, so it is paid once that week", async () => {
    const fri = (await db.query("select ($1::date + 2)::text d", [d])).rows[0].d;
    await reading(M("a1"), fri, 9000, "manual", M("a1"));
    await db.query("select public.game_close_household_day($1, $2)", [A, fri]);
    const r = await famAwards();
    const weekStart = (await db.query("select ($1::date - extract(dow from $1::date)::int)::text d", [d])).rows[0].d;
    return (r.length === 3 && r.every((x) => x.day === weekStart)) || r;
  });
  await check("The family total as the screens read it", async () =>
    (await as(kid, "select public.game_family_steps($1::date, $2::date) n", [d, thu]))[0].n === 10600);
  await check("Members see their household's step days for steps goals; another household sees none", async () =>
    (await as(kid, "select * from public.game_steps_days($1::date, $1::date)", [d])).length === 2 &&
    (await as(dan, "select * from public.game_steps_days($1::date, $1::date)", [d])).length === 0 &&
    (await as(dan, "select public.game_family_steps($1::date, $2::date) n", [d, thu]))[0].n === 0);
  await check("Members cannot run the settling or read anyone's raw count", async () =>
    (await refused(() => as(ann, `select public.game_settle_steps('${kidSteps}', current_date)`))) === true &&
    (await refused(() => as(kid, `select public.game_steps('${M("a2")}', current_date)`))) === true &&
    (await refused(() => as(kid, `select public.game_family_steps_total('${A}', current_date, current_date)`))) === true);
  await check("The weekly family goal itself earns nobody a claim", async () =>
    (await refused(() => claim(ann, familyWeek, M("a1"), "half"))) === true);
}
