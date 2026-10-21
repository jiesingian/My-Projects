// A goal and the targets that get you there (20261021030000, Janine 21
// October): a target may say which goal it helps -- a goal of its own
// household, a goal and not another target, the same person's or the whole
// household's. Checked by planner_goals_helps_check, whoever is asking and
// whatever the goal's visibility. Deleting the goal unlinks its targets and
// keeps them.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), ben = U("b1");
  const bigGoal = async (who, family, owner, title, vis = "household") =>
    (await as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, target, start_value, due_date, visibility, created_by)
      values ($1, $2, $3, $4, 65, 78, current_date + 45, $5, public.current_member_id()) returning id`, [family, title, owner ? "weight" : "custom", owner, vis]))[0].id;
  const target = async (who, family, owner, title, helps) =>
    (await as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, period, target, category, xp, points, helps_goal_id, created_by)
      values ($1, $2, 'custom', $3, 'day', 1, 'food', $4, $5, $6, public.current_member_id()) returning id`, [family, title, owner, owner ? 10 : 0, owner ? 5 : 0, helps]))[0].id;

  const annWeight = await bigGoal(ann, A, M("a1"), "Lose weight (drive)", "private");
  const houseGoal = await bigGoal(ann, A, null, "Family fit (drive)");
  const benGoal = await bigGoal(ben, B, M("b1"), "Ben weight (drive)");

  await check("Ann's own target helps her own goal, a private one included", async () => !!(await target(ann, A, M("a1"), "Diet (drive)", annWeight)));
  await check("A person's target helps the whole household's goal", async () => !!(await target(ann, A, M("a1"), "Walk (drive)", houseGoal)));
  await check("A whole-family target helps the whole household's goal", async () => !!(await target(ann, A, null, "Dinner (drive)", houseGoal)));
  await check("Not someone else's goal: Abe's target cannot help Ann's", async () =>
    (await refused(() => target(ann, A, M("a4"), "Abe diet (drive)", annWeight), "same person")) === true);
  await check("Not a whole-family target on one person's goal", async () =>
    (await refused(() => target(ann, A, null, "All diet (drive)", annWeight), "same person")) === true);
  await check("Not another household's goal", async () =>
    (await refused(() => target(ann, A, M("a1"), "Ben's (drive)", benGoal), "not in this household")) === true);
  const diet = await target(ann, A, M("a1"), "Diet 2 (drive)", annWeight);
  await check("Not another target", async () =>
    (await refused(() => target(ann, A, M("a1"), "Chain (drive)", diet), "not another target")) === true);
  await check("Not a goal helping a goal: only a target links", async () =>
    (await refused(() => as(ann, `update planner_goals set helps_goal_id = $1 where id = $2`, [annWeight, houseGoal]), "Only a target")) === true);
  await check("Moving a linked target to another person is refused too", async () =>
    (await refused(() => as(ann, `update planner_goals set owner_member_id = $1 where id = $2`, [M("a4"), diet]), "same person")) === true);
  await check("Linking later, by an update, follows the same rule", async () => {
    const loose = await target(ann, A, M("a1"), "Pickleball (drive)", null);
    await as(ann, `update planner_goals set helps_goal_id = $1 where id = $2`, [annWeight, loose]);
    const [r] = await as(ann, `select helps_goal_id from planner_goals where id = $1`, [loose]);
    return r.helps_goal_id === annWeight || r;
  });
  await check("Deleting the goal keeps its targets, unlinked", async () => {
    await as(ann, `delete from planner_goals where id = $1`, [annWeight]);
    const rows = await as(ann, `select helps_goal_id from planner_goals where id = $1`, [diet]);
    return (rows.length === 1 && rows[0].helps_goal_id === null) || rows;
  });
}
