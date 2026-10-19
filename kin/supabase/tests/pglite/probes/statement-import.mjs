// Import a statement (20261019120000): rows land in an account the caller
// may write to, duplicates already in the account are skipped (counting, so
// a statement's own repeats survive), a bad row takes the whole import back,
// and nobody imports into another person's or household's account.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_OWN = "a4000000-0000-0000-0000-000000000002";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";

const rows = (...rs) => JSON.stringify(rs.map(([date, direction, amount, particulars]) => ({ date, direction, amount, particulars })));
const run = (as, who, account, json) => as(who, "select imported, skipped from import_wealth_transactions($1, $2::jsonb)", [account, json]);

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  const statement = rows(
    ["2026-10-01", "out", 150, "GrabFood"],
    ["2026-10-02", "in", 25000, "PAYROLL  ACME"],
    ["2026-10-03", "out", 50, "Load"],
  );
  const count = async (account) => Number((await db.query(`select count(*) n from wealth_transactions where account_id = '${account}'`)).rows[0].n);

  await check("Ann imports three rows into her own GCash", async () => {
    const r = (await run(as, ann, ANN_OWN, statement))[0];
    return (r.imported === 3 && r.skipped === 0 && (await count(ANN_OWN)) === 3) || r;
  });
  await check("The same file again imports nothing and skips all three", async () => {
    await db.exec(`update wealth_transactions set created_at = now() - interval '1 hour' where account_id = '${ANN_OWN}'`);
    const r = (await run(as, ann, ANN_OWN, statement))[0];
    return (r.imported === 0 && r.skipped === 3 && (await count(ANN_OWN)) === 3) || r;
  });
  await check("Case and spacing do not hide a duplicate", async () => {
    const r = (await run(as, ann, ANN_OWN, rows(["2026-10-02", "in", "25000.00", "payroll acme"])))[0];
    return (r.imported === 0 && r.skipped === 1) || r;
  });
  await check("Two identical rows against one already there: the second comes in", async () => {
    const r = (await run(as, ann, ANN_OWN, rows(["2026-10-03", "out", 50, "Load"], ["2026-10-03", "out", 50, "Load"])))[0];
    return (r.imported === 1 && r.skipped === 1) || r;
  });
  await check("A different day, amount or direction is not a duplicate", async () => {
    const r = (await run(as, ann, ANN_OWN, rows(["2026-10-04", "out", 150, "GrabFood"], ["2026-10-01", "out", 151, "GrabFood"], ["2026-10-01", "in", 150, "GrabFood"])))[0];
    return (r.imported === 3 && r.skipped === 0) || r;
  });
  await check("The row's day is the household's day", async () => {
    const d = (await db.query(`select (occurred_at at time zone 'Asia/Manila')::date::text d from wealth_transactions where account_id = '${ANN_OWN}' and particulars = 'GrabFood' order by occurred_at limit 1`)).rows[0].d;
    return d === "2026-10-01" || d;
  });
  await check("A bad row takes the whole import back", async () => {
    const before = await count(JOINT);
    const bad = await refused(() => run(as, ann, JOINT, rows(["2026-10-05", "out", 10, "Fine"], ["2026-10-05", "sideways", 10, "Bad"])), "statement_row");
    return (bad === true && (await count(JOINT)) === before) || bad;
  });
  await check("Abe (a grown-up) imports into the joint account", async () => (await run(as, abe, JOINT, statement))[0].imported === 3);
  await check("Kid cannot import into the joint account", async () => refused(() => run(as, kid, JOINT, statement), "statement_account"));
  await check("Abe cannot import into Ann's own account", async () => refused(() => run(as, abe, ANN_OWN, statement), "statement_account"));
  await check("Ann cannot import into another household's account", async () => refused(() => run(as, ann, DAN_BANK, statement), "statement_account"));
  await check("Dan cannot import into House A's joint account", async () => refused(() => run(as, dan, JOINT, statement), "statement_account"));
  await check("An archived account takes nothing", async () => {
    await db.exec(`update accounts set is_archived = true where id = '${ANN_OWN}'`);
    return refused(() => run(as, ann, ANN_OWN, statement), "statement_account");
  });
}
