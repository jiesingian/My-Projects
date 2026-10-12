// Joint accounts are for the grown-ups (20261012210000): a child sees no
// joint account and no movement on one; the grown-ups still see both; a
// child's own account and the household-visible personal ones are unchanged.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const KID_OWN = "a4000000-0000-0000-0000-0000000000c1";
const ABE_OPEN = "a4000000-0000-0000-0000-0000000000c2";

export default async function ({ db, as, check }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4");
  await db.exec(`insert into accounts (id, family_id, name, is_joint, owner_member_id, is_private) values
    ('${KID_OWN}', '${A}', 'Kid piggy bank', false, '${P("a2")}', true),
    ('${ABE_OPEN}', '${A}', 'Abe open', false, '${P("a4")}', false)`);
  await db.exec(`insert into wealth_transactions (family_id, account_id, direction, amount, particulars) values
    ('${A}', '${JOINT}', 'in', 50000, 'salary'), ('${A}', '${KID_OWN}', 'in', 100, 'allowance')`);

  await check("Ann (parent) and Abe (adult) see the joint account and its movement", async () =>
    (await as(ann, `select 1 from accounts where id = '${JOINT}'`)).length === 1 &&
    (await as(abe, `select 1 from accounts where id = '${JOINT}'`)).length === 1 &&
    (await as(abe, `select 1 from wealth_transactions where account_id = '${JOINT}'`)).length === 1);
  await check("Kid sees neither the joint account nor its movement", async () =>
    (await as(kid, `select 1 from accounts where id = '${JOINT}'`)).length === 0 &&
    (await as(kid, `select 1 from wealth_transactions where account_id = '${JOINT}'`)).length === 0);
  await check("So Kid's sum of every movement leaves the joint 50,000 out", async () =>
    Number((await as(kid, "select coalesce(sum(amount), 0) as s from wealth_transactions"))[0].s) === 100);
  await check("Kid still sees his own account and its movement", async () =>
    (await as(kid, `select 1 from accounts where id = '${KID_OWN}'`)).length === 1 &&
    (await as(kid, `select 1 from wealth_transactions where account_id = '${KID_OWN}'`)).length === 1);
  await check("A personal account open to all is unchanged (Kid still sees Abe's)", async () =>
    (await as(kid, `select 1 from accounts where id = '${ABE_OPEN}'`)).length === 1);
}
