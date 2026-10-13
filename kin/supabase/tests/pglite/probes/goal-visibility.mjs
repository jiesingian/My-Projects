// Goals "Just me" (20261013170000, Jonathan 13 October): a private goal is
// seen by its owner and its reward's giver only -- not the rest of the
// house, not another household -- and the same goes for its entries, reward
// and change requests. Only the owner chooses, and only a grown-up may hide
// one. planner_goal_readings() hands a visible goal its numbers (steps
// counted once a day) and nothing for any other goal.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  const ins = (who, owner, kind, vis, title) =>
    as(who, `insert into planner_goals (family_id, title, kind, owner_member_id, created_by${vis ? ", visibility" : ""}) values ($1, $2, $3, $4, public.current_member_id()${vis ? ", $5" : ""}) returning id`, vis ? [A, title, kind, owner, vis] : [A, title, kind, owner]);

  const [{ id: weight }] = await ins(ann, M("a1"), "weight", "private", "Back to 55kg");
  const [{ id: shared }] = await ins(abe, M("a4"), "gym", null, "Gym 3x");
  const [{ id: annGym }] = await ins(ann, M("a1"), "gym", "private", "Ann gym");

  await check("A goal made without a choice is the household's, as every goal before today", async () =>
    (await as(kid, `select visibility from planner_goals where id = '${shared}'`))[0]?.visibility === "household");
  await check("Ann sees her own private goal", async () => (await as(ann, `select 1 from planner_goals where id = '${weight}'`)).length === 1);
  await check("Abe and Kid, same household, do not see it", async () =>
    (await as(abe, `select 1 from planner_goals where id = '${weight}'`)).length === 0 &&
    (await as(kid, `select 1 from planner_goals where id = '${weight}'`)).length === 0);
  await check("Dan, another household, does not see it", async () => (await as(dan, `select 1 from planner_goals where id = '${weight}'`)).length === 0);
  await check("Abe can neither edit nor delete it", async () =>
    (await as(abe, `update planner_goals set title = 'x' where id = '${weight}' returning id`)).length === 0 &&
    (await as(abe, `delete from planner_goals where id = '${weight}' returning id`)).length === 0 &&
    (await as(ann, `select title from planner_goals where id = '${weight}'`))[0].title === "Back to 55kg");

  await as(ann, `insert into planner_goal_entries (family_id, goal_id, member_id, amount) values ($1, $2, $3, 1)`, [A, annGym, M("a1")]);
  await check("Its entries are Ann's to see, not Abe's", async () =>
    (await as(ann, `select 1 from planner_goal_entries where goal_id = '${annGym}'`)).length === 1 &&
    (await as(abe, `select 1 from planner_goal_entries where goal_id = '${annGym}'`)).length === 0);
  await check("Abe cannot log against it or delete its entries", async () =>
    (await refused(() => as(abe, `insert into planner_goal_entries (family_id, goal_id, amount) values ($1, $2, 1)`, [A, annGym]))) === true &&
    (await as(abe, `delete from planner_goal_entries where goal_id = '${annGym}' returning id`)).length === 0);

  await as(ann, `insert into planner_goal_changes (goal_id, family_id, proposed_by, title) values ($1, $2, public.current_member_id(), 'Renamed')`, [annGym, A]);
  await check("A change request on it is hidden from Abe too", async () =>
    (await as(abe, `select 1 from planner_goal_changes where goal_id = '${annGym}'`)).length === 0 &&
    (await as(ann, `select 1 from planner_goal_changes where goal_id = '${annGym}'`)).length === 1);
  await check("Abe cannot ask to change a goal he cannot see", async () =>
    (await refused(() => as(abe, `insert into planner_goal_changes (goal_id, family_id, proposed_by, title) values ($1, $2, public.current_member_id(), 'x')`, [annGym, A]))) === true);

  // Ann asks Abe for a reward on her private goal: he gives it, so he sees it.
  await as(ann, `insert into planner_goal_rewards (goal_id, family_id, title, proposed_by, giver_member_id) values ($1, $2, 'A massage', public.current_member_id(), $3)`, [annGym, A, M("a4")]);
  await check("The reward's giver sees the private goal, its reward and its entries", async () =>
    (await as(abe, `select 1 from planner_goals where id = '${annGym}'`)).length === 1 &&
    (await as(abe, `select 1 from planner_goal_rewards where goal_id = '${annGym}'`)).length === 1 &&
    (await as(abe, `select 1 from planner_goal_entries where goal_id = '${annGym}'`)).length === 1);
  await check("Kid still sees none of it", async () =>
    (await as(kid, `select 1 from planner_goals where id = '${annGym}'`)).length === 0 &&
    (await as(kid, `select 1 from planner_goal_rewards where goal_id = '${annGym}'`)).length === 0);

  await check("Nobody hides a goal set for someone else", async () =>
    (await refused(() => ins(abe, M("a1"), "water", "private", "For Ann"), "Only the person")) === true);
  await check("A household goal cannot be hidden", async () =>
    (await refused(() => ins(ann, null, "water", "private", "House water"), "everyone")) === true);
  await check("A child cannot hide their own goal", async () =>
    (await refused(() => ins(kid, M("a2"), "custom", "private", "Secret"), "child")) === true);
  const [{ id: kidGoal }] = await ins(kid, M("a2"), "custom", null, "Read 10 books");
  await check("...nor switch it to private afterwards", async () =>
    (await refused(() => as(kid, `update planner_goals set visibility = 'private' where id = '${kidGoal}'`), "child")) === true);
  await check("Abe cannot switch Ann's goal or Kid's, either way", async () => {
    const [{ id: annShared }] = await ins(ann, M("a1"), "water", null, "Ann water");
    return (await refused(() => as(abe, `update planner_goals set visibility = 'private' where id = '${annShared}'`), "Only the person")) === true &&
      (await refused(() => as(abe, `update planner_goals set visibility = 'private' where id = '${kidGoal}'`), "Only the person")) === true;
  });
  await check("Ann switches her own goal to the household and back", async () =>
    (await as(ann, `update planner_goals set visibility = 'household' where id = '${weight}' returning id`)).length === 1 &&
    (await as(abe, `select 1 from planner_goals where id = '${weight}'`)).length === 1 &&
    (await as(ann, `update planner_goals set visibility = 'private' where id = '${weight}' returning id`)).length === 1 &&
    (await as(abe, `select 1 from planner_goals where id = '${weight}'`)).length === 0);
  await check("Other edits by the owner are not mistaken for a switch", async () =>
    (await as(ann, `update planner_goals set title = 'Back to 54kg' where id = '${weight}' returning id`)).length === 1);

  // Readings. Ann's weight in Health is "Just me" (created by her).
  await as(ann, `insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, visibility, created_by) values ($1, $2, 'weight', '2026-10-12', '58.4', 'kg', 'private', public.current_member_id())`, [A, M("a1")]);
  await check("While the goal is private, Abe gets none of its readings", async () =>
    (await as(abe, `select * from planner_goal_readings('2026-10-01') where goal_id = '${weight}'`)).length === 0);
  await as(ann, `update planner_goals set visibility = 'household' where id = '${weight}'`);
  await check("Shared, the goal's numbers reach Abe, though the reading stays private in Health", async () =>
    Number((await as(abe, `select value from planner_goal_readings('2026-10-01') where goal_id = '${weight}'`))[0]?.value) === 58.4 &&
    (await as(abe, `select 1 from health_vitals where member_id = '${M("a1")}'`)).length === 0);
  await check("Dan gets nothing of House A's readings", async () =>
    (await as(dan, `select * from planner_goal_readings('2026-01-01')`)).length === 0);

  // Steps: Ann's watch says 4,000 and she typed 9,000; Abe's watch says 3,000.
  await as(ann, `insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, source, created_by) values ($1, $2, 'steps', '2026-10-12', '4000', 'steps', 'apple_health', public.current_member_id()), ($1, $2, 'steps', '2026-10-12', '9000', 'steps', 'manual', public.current_member_id())`, [A, M("a1")]);
  await as(abe, `insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text, unit, source, created_by) values ($1, $2, 'steps', '2026-10-12', '3,000', 'steps', 'apple_health', public.current_member_id())`, [A, M("a4")]);
  const [{ id: annSteps }] = await ins(ann, M("a1"), "steps", null, "Ann 10k");
  const [{ id: houseSteps }] = await ins(abe, null, "steps", null, "House 20k");
  await check("A day's steps count once: the larger of the watch and the hand entry", async () =>
    Number((await as(kid, `select value from planner_goal_readings('2026-10-01') where goal_id = '${annSteps}'`))[0]?.value) === 9000);
  await check("A household steps goal adds each person's day, counted once", async () =>
    Number((await as(kid, `select value from planner_goal_readings('2026-10-01') where goal_id = '${houseSteps}'`))[0]?.value) === 12000);
  await check("Readings before the window are left out", async () =>
    (await as(kid, `select * from planner_goal_readings('2026-10-13') where goal_id = '${annSteps}'`)).length === 0);
  await check("Anonymous callers cannot run the readings function", async () =>
    (await refused(() => as("00000000-0000-0000-0000-000000000000", `select * from planner_goal_readings('2026-01-01')`))) !== "was allowed" ||
    (await as("00000000-0000-0000-0000-000000000000", `select * from planner_goal_readings('2026-01-01')`)).length === 0);
}
