// Which account a bill comes out of (20261026130000_bill_account): chosen
// when the expense is added, it has to be an account of the same household.
// Run as the database owner: the trigger refuses another household's
// account whoever writes it.
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";

export default async function ({ db, check, refused }) {
  const q = async (sql) => (await db.query(sql)).rows;
  const bill = (account) => `insert into bills (family_id, name, account_id) values ('${A}', 'Meralco', ${account ? `'${account}'` : "null"}) returning id, account_id`;

  await check("A bill can be left with no account, as every bill was", async () => {
    const [b] = await q(bill(null));
    return b.account_id === null;
  });
  await check("A bill can name the joint account it comes out of", async () => {
    const [b] = await q(bill(JOINT));
    return b.account_id === JOINT;
  });
  await check("Or a member's own account", async () => {
    const [b] = await q(bill(ANN_GCASH));
    return b.account_id === ANN_GCASH;
  });
  await check("Dan's account, of another household, is refused", async () => refused(() => q(bill(DAN_BANK)), "not this household"));
  await check("Moving a bill to Dan's account afterwards is refused too", async () =>
    refused(() => q(`update bills set account_id = '${DAN_BANK}' where account_id = '${JOINT}'`), "not this household"));
  await check("Moving it between the household's own accounts is fine", async () => {
    const [b] = await q(`update bills set account_id = '${ANN_GCASH}' where account_id = '${JOINT}' returning account_id`);
    return b.account_id === ANN_GCASH;
  });
  await check("A deleted account lets go of its bills", async () => {
    await q(`delete from wealth_transactions where account_id = '${ANN_GCASH}'`);
    await q(`delete from accounts where id = '${ANN_GCASH}'`);
    const rows = await q(`select count(*)::int as n from bills where account_id = '${ANN_GCASH}'`);
    return rows[0].n === 0;
  });
}
