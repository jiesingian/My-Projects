// Renewable goals earn points (20261013171000, Jonathan 13 October): what a
// goal is worth is a grown-up's to set; a claim is the owner's own; a
// grown-up's counts at once and a child's waits for a grown-up's yes; what a
// claim is worth comes from the goal, never from the client; nobody answers
// their own; another household sees nothing.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  const goal = async (who, owner, period, points) =>
    (await as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, period, points, created_by) values ($1, 'Goal', 'water', $2, $3, $4, public.current_member_id()) returning id`, [A, owner, period, points]))[0].id;
  const claim = (who, goalId, day, extra = "") =>
    as(who, `insert into planner_goal_completions (family_id, goal_id, member_id, period_start${extra ? ", points, status" : ""}) values ($1, $2, public.current_member_id(), $3${extra}) returning points, status`, [A, goalId, day]);
  const today = (await as(ann, "select current_date::text as d"))[0].d;

  const kidWater = await goal(ann, M("a2"), "day", 5);
  const annSteps = await goal(ann, M("a1"), "day", 3);

  await check("A grown-up sets what a child's daily goal is worth", async () =>
    (await as(kid, `select points from planner_goals where id = '${kidWater}'`))[0].points === 5);
  await check("A child cannot make a goal worth points, nor raise one", async () =>
    (await refused(() => goal(kid, M("a2"), "day", 50), "grown-up")) === true &&
    (await refused(() => as(kid, `update planner_goals set points = 500 where id = '${kidWater}'`), "grown-up")) === true);
  await check("A child can still edit the rest of their goal", async () =>
    (await as(kid, `update planner_goals set title = 'Water!' where id = '${kidWater}' returning id`)).length === 1);
  await check("No points on a household goal or a one-off goal", async () =>
    (await refused(() => goal(ann, null, "day", 5))) === true &&
    (await refused(() => goal(ann, M("a1"), "total", 5))) === true);

  await check("Kid's claim waits, worth the goal's 5 -- whatever the client sent", async () => {
    const [row] = await claim(kid, kidWater, today, ", 999, 'counted'");
    return (row.points === 5 && row.status === "pending") || row;
  });
  await check("Ann's own claim counts at once", async () => {
    const [row] = await claim(ann, annSteps, today);
    return (row.points === 3 && row.status === "counted") || row;
  });
  await check("One claim per period", async () => (await refused(() => claim(kid, kidWater, today))) === true);
  await check("Nobody claims someone else's goal", async () => (await refused(() => claim(abe, annSteps, today))) === true);
  await check("No claims on a one-off goal, or a year back", async () => {
    const oneOff = (await as(ann, `insert into planner_goals (family_id, title, kind, owner_member_id, period, created_by) values ($1, 'Read', 'custom', $2, 'total', public.current_member_id()) returning id`, [A, M("a1")]))[0].id;
    return (await refused(() => claim(ann, oneOff, today))) === true && (await refused(() => claim(ann, annSteps, "2025-01-01"))) === true;
  });

  const kidClaim = (await as(ann, `select id from planner_goal_completions where goal_id = '${kidWater}'`))[0].id;
  await check("Kid cannot answer his own claim", async () =>
    (await as(kid, `update planner_goal_completions set status = 'counted', decided_by = public.current_member_id() where id = '${kidClaim}' returning id`)).length === 0);
  await check("Ann cannot answer her own (already counted) claim, nor re-price it", async () =>
    (await as(ann, `update planner_goal_completions set status = 'refused', decided_by = public.current_member_id() where goal_id = '${annSteps}' returning id`)).length === 0);
  await check("A grown-up cannot change what a claim was worth while answering", async () =>
    (await refused(() => as(abe, `update planner_goal_completions set status = 'counted', decided_by = public.current_member_id(), points = 900 where id = '${kidClaim}'`), "keeps")) === true);
  await check("Abe says yes to Kid's claim", async () =>
    (await as(abe, `update planner_goal_completions set status = 'counted', decided_by = public.current_member_id(), decided_at = now() where id = '${kidClaim}' returning status`))[0]?.status === "counted");
  await check("...and cannot answer it a second time", async () =>
    (await as(ann, `update planner_goal_completions set status = 'refused', decided_by = public.current_member_id() where id = '${kidClaim}' returning id`)).length === 0);

  await check("Dan, another household, sees none of it and cannot claim", async () =>
    (await as(dan, `select 1 from planner_goal_completions`)).length === 0 &&
    (await refused(() => as(dan, `insert into planner_goal_completions (family_id, goal_id, member_id, period_start) values ($1, $2, public.current_member_id(), current_date)`, [A, kidWater]))) === true);
  await check("A grown-up raising the points later does not rewrite what was earned", async () =>
    (await as(ann, `update planner_goals set points = 10 where id = '${kidWater}' returning id`)).length === 1 &&
    (await as(ann, `select points from planner_goal_completions where id = '${kidClaim}'`))[0].points === 5);

  // A refused claim stays: deleting it and claiming again would undo the no.
  const yesterday = (await as(ann, "select (current_date - 1)::text as d"))[0].d;
  await claim(kid, kidWater, yesterday);
  const second = (await as(ann, `select id from planner_goal_completions where goal_id = '${kidWater}' and period_start = '${yesterday}'`))[0].id;
  await as(abe, `update planner_goal_completions set status = 'refused', decided_by = public.current_member_id() where id = '${second}'`);
  await check("A refused claim cannot be deleted to try again", async () =>
    (await as(kid, `delete from planner_goal_completions where id = '${second}' returning id`)).length === 0);
  await check("The owner can take back a claim that was not refused", async () =>
    (await as(ann, `delete from planner_goal_completions where goal_id = '${annSteps}' returning id`)).length === 1);

  await check("A private goal's claims are hidden like the goal", async () => {
    const hidden = (await as(ann, `insert into planner_goals (family_id, title, kind, owner_member_id, period, points, visibility, created_by) values ($1, 'Mine', 'gym', $2, 'week', 2, 'private', public.current_member_id()) returning id`, [A, M("a1")]))[0].id;
    await claim(ann, hidden, today);
    return (await as(abe, `select 1 from planner_goal_completions where goal_id = '${hidden}'`)).length === 0 &&
      (await as(ann, `select 1 from planner_goal_completions where goal_id = '${hidden}'`)).length === 1;
  });
}
