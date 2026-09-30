const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  const add = (who, fam, by, name = "Fiesta") =>
    as(who, "insert into household_special_days (family_id, day, name, created_by) values ($1, '2026-10-12', $2, $3) returning id", [fam, name, by]);
  let id;
  await check("A grown-up adds a special day to their household", async () => { id = (await add(ann, A, M("a1")))[0].id; return !!id; });
  await check("Their child sees it", async () => (await as(kid, "select name from household_special_days")).length === 1);
  await check("Another household sees nothing", async () => (await as(ben, "select 1 from household_special_days")).length === 0);
  await check("A child cannot add one", async () => refused(() => add(kid, A, M("a2"), "Kid day")));
  await check("Nobody adds one to another household", async () => refused(() => add(ben, A, M("b1"), "Sneaky")));
  await check("Nobody adds one in someone else's name", async () => refused(() => add(ann, A, M("d1"), "Forged")));
  await check("An adult of another household cannot delete it", async () => {
    await as(dan, "delete from household_special_days where id = $1", [id]);
    return (await as(ann, "select 1 from household_special_days")).length === 1;
  });
  await check("A child cannot delete it", async () => {
    await as(kid, "delete from household_special_days where id = $1", [id]);
    return (await as(ann, "select 1 from household_special_days")).length === 1;
  });
  await check("The grown-up removes it", async () => {
    await as(ann, "delete from household_special_days where id = $1", [id]);
    return (await as(ann, "select 1 from household_special_days")).length === 0;
  });
  await check("A blank name is refused", async () => refused(() => add(ann, A, M("a1"), "   ")));
}
