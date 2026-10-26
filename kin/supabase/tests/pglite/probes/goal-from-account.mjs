// A goal's From account and start date (20261026190000): both optional, a
// start after the end refused, and an account deleted leaves the goal with
// no From account rather than taking the goal with it.
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, check, refused }) {
  await db.exec("reset role");
  const acc = (await db.query("insert into accounts (family_id, name) values ($1, 'Savings jar') returning id", [A])).rows[0].id;
  let goal;
  await check("A goal takes a From account and a start date, or neither", async () => {
    goal = (await db.query("insert into goals (family_id, title, from_account_id, start_date, target_date) values ($1, 'Laptop', $2, '2026-11-01', '2027-06-30') returning id", [A, acc])).rows[0].id;
    const bare = (await db.query("insert into goals (family_id, title) values ($1, 'Someday') returning id", [A])).rows.length;
    return typeof goal === "string" && bare === 1;
  });
  await check("A start after the end is refused", async () =>
    refused(() => db.query("insert into goals (family_id, title, start_date, target_date) values ($1, 'x', '2027-01-01', '2026-01-01')", [A])));
  await check("Deleting the account keeps the goal, with no From account", async () => {
    await db.query("delete from accounts where id = $1", [acc]);
    const row = (await db.query("select from_account_id from goals where id = $1", [goal])).rows[0];
    return row && row.from_account_id === null;
  });
}
