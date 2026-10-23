// A budget and an actual cost on each line (20261023200000): amounts never
// negative, and both inside the household like the rest of the line.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const BEN = "10000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  await check("Ann adds a line with a budget, then says what it cost", async () => {
    await as(ANN, "insert into buy_items (family_id, name, budget) values ($1, 'Rice', 110)", [A]);
    await as(ANN, "update buy_items set checked = true, actual_cost = 104.5 where name = 'Rice'");
    const r = (await db.query("select budget, actual_cost from buy_items where name = 'Rice'")).rows;
    return (Number(r[0].budget) === 110 && Number(r[0].actual_cost) === 104.5) || { r };
  });
  await check("A line with no budget is fine, as before", async () =>
    (await as(ANN, "insert into buy_items (family_id, name) values ($1, 'Salt') returning budget", [A]))[0].budget === null);
  await check("Neither amount can be negative", async () => {
    const budget = await refused(() => as(ANN, "insert into buy_items (family_id, name, budget) values ($1, 'Eggs', -1)", [A]));
    const actual = await refused(() => as(ANN, "update buy_items set actual_cost = -5 where name = 'Rice'"));
    return (budget === true && actual === true) || { budget, actual };
  });
  await check("Another household neither sees nor changes them", async () => {
    const seen = await as(BEN, "select budget from buy_items where family_id = $1", [A]);
    await as(BEN, "update buy_items set actual_cost = 1 where name = 'Rice'");
    const r = (await db.query("select actual_cost from buy_items where name = 'Rice'")).rows;
    return (seen.length === 0 && Number(r[0].actual_cost) === 104.5) || { seen, r };
  });
}
