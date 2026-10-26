// Market apart from Groceries (20261026140000): expenses and bills under
// Groceries that name a market move to Market, a supermarket stays, other
// categories and money in are left alone; every Groceries budget in force
// is removed from this month on and past months keep theirs.
import fs from "node:fs";
const A = "a0000000-0000-0000-0000-000000000000";
const ACC = "a4000000-0000-0000-0000-000000000001";
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const run = (db) => db.exec(fs.readFileSync(new URL("../../../migrations/20261026140000_market_category.sql", import.meta.url), "utf8"));

export default async function ({ db, check }) {
  await db.exec("reset role");
  await db.query(
    `insert into wealth_transactions (family_id, account_id, direction, amount, particulars, category) values
     ($1, $2, 'out', 500, 'Palengke - fish and veggies', 'Groceries'),
     ($1, $2, 'out', 300, 'Talipapa sa kanto', 'Groceries'),
     ($1, $2, 'out', 900, 'Farmers Market Cubao', 'Groceries'),
     ($1, $2, 'out', 2500, 'SM Supermarket', 'Groceries'),
     ($1, $2, 'out', 150, 'Market Market food court', 'Dining'),
     ($1, $2, 'in', 200, 'Market stall refund', 'Groceries')`,
    [A, ACC],
  );
  await db.query(`insert into bills (family_id, name, amount, category) values ($1, 'Wet market suki', 1000, 'Groceries'), ($1, 'Puregold', 3000, 'Groceries')`, [A]);
  await db.query(
    `insert into spending_budgets (family_id, member_id, category, amount, from_month) values
     ($1, null, 'Groceries', 30000, '2026-01-01'), ($1, $2, 'Groceries', 2000, '2026-01-01'), ($1, $2, 'Dining', 1500, '2026-01-01')`,
    [A, P("a1")],
  );
  await run(db);

  const cats = async () => (await db.query("select particulars, category from wealth_transactions where family_id = $1 order by particulars", [A])).rows.map((r) => `${r.particulars}=${r.category}`).join("; ");
  await check("Expenses naming a market move; a supermarket, another category and money in stay", async () => {
    const got = await cats();
    return got === "Farmers Market Cubao=Market; Market Market food court=Dining; Market stall refund=Groceries; Palengke - fish and veggies=Market; SM Supermarket=Groceries; Talipapa sa kanto=Market" || got;
  });
  await check("Bills naming a market move, others stay", async () => {
    const got = (await db.query("select name, category from bills where family_id = $1 and category is not null order by name", [A])).rows.map((r) => `${r.name}=${r.category}`).join("; ");
    return got === "Puregold=Groceries; Wet market suki=Market" || got;
  });
  const inForce = async () =>
    (await db.query(
      `select distinct on (member_id, category) coalesce(member_id::text, 'family') as whose, category, amount::float8 as amount
       from spending_budgets where family_id = $1 order by member_id, category, from_month desc`,
      [A],
    )).rows.map((r) => `${r.whose === "family" ? "family" : "ann"} ${r.category} ${r.amount}`).sort().join(", ");
  await check("Groceries budgets are removed from this month on; Dining is untouched; January keeps its budget", async () => {
    const got = await inForce();
    const jan = (await db.query("select amount::float8 as a from spending_budgets where family_id = $1 and member_id is null and category = 'Groceries' and from_month = '2026-01-01'", [A])).rows[0]?.a;
    return (got === "ann Dining 1500, ann Groceries 0, family Dining 0, family Groceries 0" && jan === 30000) || { got, jan };
  });
  await check("Run again, nothing more changes", async () => {
    const before = (await cats()) + (await inForce());
    await run(db);
    return before === (await cats()) + (await inForce());
  });
}
