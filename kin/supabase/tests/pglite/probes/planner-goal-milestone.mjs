// 🎯 milestones (20261029235000): only the four steps, set within the
// household, never by another.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), dan = U("d1");
  const [goal] = await as(ann, `insert into planner_goals (family_id, title, kind, target, period, created_by) values ($1, 'Fund', 'money', 1000, 'total', $2) returning id`, [A, M("a1")]);
  await check("A new goal has celebrated nothing yet", async () => (await as(ann, "select milestone from planner_goals where id = $1", [goal.id]))[0]?.milestone === 0);
  await check("Ann's household marks 50%", async () => (await as(ann, "update planner_goals set milestone = 50 where id = $1 returning milestone", [goal.id])).length === 1);
  await check("Only the four steps", async () => (await refused(() => as(ann, "update planner_goals set milestone = 30 where id = $1", [goal.id]))) === true);
  await check("Another household can't touch it", async () => (await as(dan, "update planner_goals set milestone = 100 where id = $1 returning id", [goal.id])).length === 0);
}
