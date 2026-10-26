// A goal's second From account (20261027130000): two different sources, each
// with an optional amount a month; the same account twice, or an amount of
// nothing, is refused; an account deleted leaves the goal without that source.
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, check, refused }) {
  await db.exec("reset role");
  const acc = async (name) => (await db.query("insert into accounts (family_id, name) values ($1, $2) returning id", [A, name])).rows[0].id;
  const salary = await acc("Salary"), business = await acc("Business");
  let goal;
  await check("Two sources, each with what it gives a month", async () => {
    goal = (await db.query(
      "insert into goals (family_id, title, from_account_id, from_amount, from_account_2_id, from_2_amount) values ($1, 'Car', $2, 3000, $3, 2000) returning id",
      [A, salary, business],
    )).rows[0].id;
    return typeof goal === "string";
  });
  await check("The same account twice is refused", async () =>
    refused(() => db.query("insert into goals (family_id, title, from_account_id, from_account_2_id) values ($1, 'x', $2, $2)", [A, salary])));
  await check("An amount of nothing is refused", async () =>
    refused(() => db.query("insert into goals (family_id, title, from_account_id, from_amount) values ($1, 'x', $2, 0)", [A, salary])));
  await check("Deleting the second account leaves the goal with its first", async () => {
    await db.query("delete from accounts where id = $1", [business]);
    const g = (await db.query("select from_account_id, from_account_2_id from goals where id = $1", [goal])).rows[0];
    return g.from_account_id === salary && g.from_account_2_id === null;
  });
}
