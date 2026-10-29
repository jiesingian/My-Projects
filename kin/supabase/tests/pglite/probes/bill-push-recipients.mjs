const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "00000000-0000-0000-0000-0000000000a1";
const ABE = "00000000-0000-0000-0000-0000000000a4";
const KID = "00000000-0000-0000-0000-0000000000a2";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const JOINT_BDO = "a4000000-0000-0000-0000-000000000001";
// Bill pushes only to whoever has to pay (20261029130000_bill_pushes_to_who_pays):
// the account's owner, else the bill's owner, else (joint) every grown-up.
// 7 October 2026, 10:00 in Manila is 02:00 UTC.
export default async function ({ db, check }) {
  // Abe, House A's other grown-up, has a phone too.
  await db.query("insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values ($1, $2, 'https://push/Abe A', 'k', 'a')", [ABE, A]);
  await db.query(
    `insert into bills (family_id, name, amount, due_date, remind_days_before, status, account_id, owner_member_id, is_joint) values
      ($1, 'Ann card', 900, '2026-10-10', 3, 'unpaid', $2, null, null),
      ($1, 'Abe phone', 1299, '2026-10-10', 3, 'unpaid', null, $3, false),
      ($1, 'Joint water', 600, '2026-10-10', 3, 'unpaid', $4, null, true),
      ($1, 'Unnamed', 100, '2026-10-10', 3, 'unpaid', null, null, null),
      ($1, 'Kid allowance', 200, '2026-10-10', 3, 'unpaid', null, $5, false)`,
    [A, ANN_GCASH, ABE, JOINT_BDO, KID],
  );
  const who = async (fn, now) =>
    (await db.query(`select * from ${fn}($1, $2)`, [SECRET, now])).rows.map((r) => `${r.endpoint.split("/").pop()}: ${r.title.split(" is due")[0]}`).sort();
  let ahead;
  await check("Days ahead: paid from Ann's own account, only Ann", async () => {
    ahead = await who("due_bill_ahead_reminders", "2026-10-07 02:00+00");
    return (ahead.includes("Ann A: Ann card") && !ahead.includes("Abe A: Ann card")) || ahead;
  });
  await check("Abe's own bill: only Abe", async () => (ahead.includes("Abe A: Abe phone") && !ahead.includes("Ann A: Abe phone")) || ahead);
  await check("Joint, or nobody named: both grown-ups", async () =>
    ["Ann A: Joint water", "Abe A: Joint water", "Ann A: Unnamed", "Abe A: Unnamed"].every((x) => ahead.includes(x)) || ahead);
  await check("A child's bill goes to the grown-ups, not the child", async () =>
    (ahead.includes("Ann A: Kid allowance") && ahead.includes("Abe A: Kid allowance") && !ahead.includes("Kid A: Kid allowance")) || ahead);
  await check("The day before (due_reminders) follows the same rule", async () => {
    const eve = await who("due_reminders", "2026-10-09 02:00+00");
    const bills = eve.filter((x) => /card|phone|water|Unnamed/.test(x));
    return bills.join("|") === "Abe A: Abe phone|Abe A: Joint water|Abe A: Unnamed|Ann A: Ann card|Ann A: Joint water|Ann A: Unnamed" || eve;
  });
  await check("An owner who has left falls back to the grown-ups", async () => {
    await db.query("update bills set due_date = '2026-10-11' where name = 'Abe phone'");
    await db.query("update members set status = 'removed' where id = $1", [ABE]);
    const rows = await who("due_bill_ahead_reminders", "2026-10-08 02:00+00");
    await db.query("update members set status = 'active' where id = $1", [ABE]);
    return rows.includes("Ann A: Abe phone") || rows;
  });
  await check("No one outside the household can call the helper", async () => {
    const r = await db.query("select has_function_privilege('anon', 'public.money_push_recipients(uuid, uuid, uuid, boolean)', 'execute') as anon, has_function_privilege('authenticated', 'public.money_push_recipients(uuid, uuid, uuid, boolean)', 'execute') as auth");
    return (!r.rows[0].anon && !r.rows[0].auth) || r.rows[0];
  });
}
