// Who can see an account, person by person (20261012200000): Ann names Abe
// (her husband) on her private GCash; he sees it and its movements, the kid
// still does not, nobody outside the house ever does, and only Ann names.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const JOINT = "a4000000-0000-0000-0000-000000000001";

const name = (account, member, by, family = A) =>
  `insert into account_viewers (account_id, member_id, family_id, added_by) values ('${account}', '${member}', '${family}', '${by}') returning member_id`;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  await db.exec(`insert into wealth_transactions (family_id, account_id, direction, amount, particulars) values ('${A}', '${ANN_GCASH}', 'in', 5000, 'pay')`);

  await check("Before: Abe does not see Ann's private account", async () =>
    (await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0);
  await check("Ann names Abe on it", async () => (await as(ann, name(ANN_GCASH, P("a4"), P("a1")))).length === 1);
  await check("Abe now sees it and its movement", async () =>
    (await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 1 &&
    (await as(abe, `select 1 from wealth_transactions where account_id = '${ANN_GCASH}'`)).length === 1);
  await check("Kid still sees neither", async () =>
    (await as(kid, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0 &&
    (await as(kid, `select 1 from wealth_transactions where account_id = '${ANN_GCASH}'`)).length === 0);
  await check("Kid does not see who it is shared with", async () => (await as(kid, "select 1 from account_viewers")).length === 0);
  await check("Abe sees only his own row on the list; Ann sees hers", async () =>
    (await as(abe, "select 1 from account_viewers")).length === 1 && (await as(ann, "select 1 from account_viewers")).length === 1);
  await check("Abe cannot add Kid to Ann's account, nor remove himself from it", async () =>
    (await refused(() => as(abe, name(ANN_GCASH, P("a2"), P("a4"))))) === true &&
    (await as(abe, "delete from account_viewers returning member_id")).length === 0);
  await check("Kid cannot name himself", async () => refused(() => as(kid, name(ANN_GCASH, P("a2"), P("a2")))));
  await check("Ann cannot name someone from another household", async () =>
    (await refused(() => as(ann, name(ANN_GCASH, P("d1"), P("a1"))))) === true &&
    (await refused(() => as(ann, name(ANN_GCASH, P("b1"), P("a1"))))) === true);
  await check("Ann cannot add in Abe's name (forged adder), nor name herself", async () =>
    (await refused(() => as(ann, name(ANN_GCASH, P("a2"), P("a4"))))) === true &&
    (await refused(() => as(ann, name(ANN_GCASH, P("a1"), P("a1"))))) === true);
  await check("Nobody names viewers on a joint account", async () => refused(() => as(ann, name(JOINT, P("a4"), P("a1")))));
  await check("Ben and Dan see nothing of it", async () =>
    (await as(ben, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0 &&
    (await as(dan, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0 &&
    (await as(dan, "select 1 from account_viewers")).length === 0);
  await check("Ann names Kid too; Kid now sees it and its movement", async () =>
    (await as(ann, name(ANN_GCASH, P("a2"), P("a1")))).length === 1 &&
    (await as(kid, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 1 &&
    (await as(kid, `select 1 from wealth_transactions where account_id = '${ANN_GCASH}'`)).length === 1);
  await check("Opened to everyone, it is still Kid's only because he is named", async () => {
    await db.exec(`update accounts set is_private = false where id = '${ANN_GCASH}'`);
    const named = (await as(kid, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 1;
    await as(ann, `delete from account_viewers where member_id = '${P("a2")}'`);
    const unnamed = (await as(kid, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0;
    const abeStill = (await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 1;
    await db.exec(`update accounts set is_private = true where id = '${ANN_GCASH}'`);
    return named && unnamed && abeStill;
  });
  await check("Ann takes Abe off; he no longer sees it", async () =>
    (await as(ann, "delete from account_viewers returning member_id")).length >= 1 &&
    (await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0);
}
