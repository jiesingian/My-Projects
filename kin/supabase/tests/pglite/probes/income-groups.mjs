// Regular income groups (20261022170000): the household's grown-ups only,
// children and other households see nothing, and a payment can only be
// filed under its own household's group.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const annM = P("a1");

  const group = (who, by, family = A) =>
    as(who, "insert into income_groups (family_id, name, category, usual_amount, frequency, monthly_target, recorded_by) values ($1, 'Rice Business', 'Business', 14000, 'monthly', 20000, $2) returning id", [family, by]);
  const schedule = (who, family, g) =>
    as(who, "insert into income_schedules (family_id, name, amount, group_id) values ($1, 'Rice Business', 14000, $2) returning id", [family, g]);

  let g, gD;
  await check("Ann sets up a regular income", async () => {
    g = (await group(ann, annM))[0].id;
    return typeof g === "string";
  });
  await check("Abe, a grown-up of the household, sees it and can change it", async () =>
    (await as(abe, "select 1 from income_groups where id = $1", [g])).length === 1 &&
    (await as(abe, "update income_groups set monthly_target = 25000 where id = $1 returning 1", [g])).length === 1);
  await check("A payment files under its own household's group", async () => (await schedule(ann, A, g)).length === 1);
  await check("Nobody sets one up in someone else's name", async () => refused(() => group(abe, annM)));
  await check("Bad amounts and frequencies are refused", async () =>
    (await refused(() => as(ann, "insert into income_groups (family_id, name, usual_amount, frequency, recorded_by) values ($1, 'x', 0, 'monthly', $2)", [A, annM]))) === true &&
    (await refused(() => as(ann, "insert into income_groups (family_id, name, usual_amount, frequency, recorded_by) values ($1, 'x', 10, 'hourly', $2)", [A, annM]))) === true);
  await check("Kid sees nothing and writes nothing", async () =>
    (await as(kid, "select 1 from income_groups")).length === 0 &&
    (await refused(() => group(kid, P("a2")))) === true &&
    (await as(kid, "update income_groups set name = 'x' where id = $1 returning 1", [g])).length === 0 &&
    (await as(kid, "delete from income_groups where id = $1 returning 1", [g])).length === 0);
  await check("Ben (linked) and Dan (stranger) see nothing of House A's", async () =>
    (await as(ben, "select 1 from income_groups")).length === 0 &&
    (await as(dan, "select 1 from income_groups")).length === 0);
  await check("Dan cannot write into House A, change or delete its group", async () =>
    (await refused(() => group(dan, P("d1")))) === true &&
    (await as(dan, "update income_groups set name = 'x' where id = $1 returning 1", [g])).length === 0 &&
    (await as(dan, "delete from income_groups where id = $1 returning 1", [g])).length === 0);
  // income_schedule_group_in_family: the trigger that keeps a payment
  // under its own household's group, both ways.
  await check("income_schedule_group_in_family: Dan cannot file his own household's income under House A's group", async () => {
    gD = (await group(dan, P("d1"), D))[0].id;
    return (await refused(() => schedule(dan, D, g), "income_group_not_in_family")) === true &&
      (await refused(() => schedule(ann, A, gD), "income_group_not_in_family")) === true;
  });
  await check("Deleting the group keeps its payments, ungrouped", async () => {
    await as(abe, "delete from income_groups where id = $1", [g]);
    return (await as(ann, "select 1 from income_schedules where family_id = $1 and group_id is null", [A])).length === 1;
  });
}
