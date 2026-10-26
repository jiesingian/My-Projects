// Today's household budget becomes Family's (20261026110000): each month's
// category budgets are copied as Family's from that month, a category a
// later month dropped is written as removed (0) then, and a budget set since
// is never overwritten by a second run.
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, check }) {
  const rows = async () =>
    (await db.query("select category, amount::float8 as amount, to_char(from_month, 'YYYY-MM') as m from spending_budgets where family_id = $1 and member_id is null order by m, category", [A])).rows
      .map((r) => `${r.m} ${r.category} ${r.amount}`)
      .join(", ");
  await check("Each month's budget is Family's from that month; Dining, dropped in October, is removed then", async () => {
    const got = await rows();
    return got === "2026-09 Dining 5000, 2026-09 Groceries 30000, 2026-10 Dining 0, 2026-10 Groceries 32000" || got;
  });
  await check("Run again, a budget changed since stays as it was set", async () => {
    await db.exec("reset role");
    await db.query("update spending_budgets set amount = 40000 where family_id = $1 and category = 'Groceries' and from_month = '2026-10-01'", [A]);
    await db.exec((await import("node:fs")).readFileSync(new URL("../../../migrations/20261026110000_household_budget_to_family.sql", import.meta.url), "utf8"));
    const got = await rows();
    return got === "2026-09 Dining 5000, 2026-09 Groceries 30000, 2026-10 Dining 0, 2026-10 Groceries 40000" || got;
  });
}
