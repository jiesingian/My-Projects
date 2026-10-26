// What a bill is for (20261026150000_bill_for_loan_asset_goal): a loan, an
// asset or a goal of the same household, both columns or neither; a target
// deleted lets go of its bills. Run as the database owner: the trigger
// refuses another household's row whoever writes it.
const A = "a0000000-0000-0000-0000-000000000000";
const A_LOAN = "a6000000-0000-0000-0000-000000000001";
const D_LOAN = "d6000000-0000-0000-0000-000000000001";

export default async function ({ db, check, refused }) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const [asset] = await q(`select id from assets where family_id = $1 limit 1`, [A]);
  const [goal] = await q(`insert into goals (family_id, title) values ($1, 'Trip') returning id`, [A]);
  const bill = (table, id) => q(`insert into bills (family_id, name, against_table, against_id) values ($1, 'Amortisation', $2, $3) returning id, against_table, against_id`, [A, table, id]);

  await check("A bill can be for nothing in particular, as every bill was", async () => {
    const [b] = await bill(null, null);
    return b.against_table === null && b.against_id === null;
  });
  await check("A bill can be for the household's own loan", async () => {
    const [b] = await bill("liabilities", A_LOAN);
    return b.against_table === "liabilities" && b.against_id === A_LOAN;
  });
  await check("Or one of its assets, or a goal", async () => {
    const [b1] = await bill("assets", asset.id);
    const [b2] = await bill("goals", goal.id);
    return b1.against_table === "assets" && b2.against_table === "goals";
  });
  await check("Dan's loan, of another household, is refused", async () => refused(() => bill("liabilities", D_LOAN), "not this household"));
  await check("A table that is not a loan, an asset or a goal is refused", async () => refused(() => bill("members", A_LOAN)));
  await check("One column without the other is refused", async () =>
    (await refused(() => q(`insert into bills (family_id, name, against_table) values ($1, 'X', 'liabilities')`, [A]))) &&
    (await refused(() => q(`insert into bills (family_id, name, against_id) values ($1, 'X', $2)`, [A, A_LOAN]))));
  await check("Moving a bill to Dan's loan afterwards is refused too", async () =>
    refused(() => q(`update bills set against_id = $1 where against_table = 'liabilities' and against_id = $2`, [D_LOAN, A_LOAN]), "not this household"));
  await check("A goal deleted lets go of its bills", async () => {
    await q(`delete from goals where id = $1`, [goal.id]);
    const [b] = await q(`select against_table, against_id from bills where name = 'Amortisation' and against_table = 'goals'`);
    return b === undefined;
  });
}
