// Whose an account is, changed afterwards (20261029140000_move_account_owner):
// Ann put an MP2 under her own name that was Baby's. It moves to Baby with
// the movements that were simply Ann's; one tagged to Abe or to the family
// keeps its tag. Only a grown-up moves one, only between themselves, the
// family and a managed child -- never another grown-up's or a child's with
// a login -- and never across households.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";
const move = (account, owner) => `select public.move_account_owner('${account}', ${owner ? `'${owner}'` : "null"})`;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  const q = async (sql) => (await db.query(sql)).rows;
  const entry = (account, tag = "") =>
    `insert into wealth_transactions (family_id, account_id, direction, amount, particulars${tag ? ", is_joint, owner_member_id" : ""}) values ('${A}', '${account}', 'in', 100, 'probe'${tag}) returning id`;
  const [mine] = await q(entry(ANN_GCASH));
  const [abes] = await q(entry(ANN_GCASH, `, false, '${P("a4")}'`));
  const [family] = await q(entry(ANN_GCASH, ", true, null"));
  await q(`insert into account_viewers (account_id, member_id, family_id, added_by) values ('${ANN_GCASH}', '${P("a4")}', '${A}', '${P("a1")}')`);
  const owner = async (id) => (await q(`select is_joint, owner_member_id from wealth_transactions where id = '${id}'`))[0];

  await check("Kid, a child with a login, cannot move it", async () => refused(() => as(kid, move(ANN_GCASH, P("a3"))), "grown-up"));
  await check("Abe cannot move Ann's own account", async () => refused(() => as(abe, move(ANN_GCASH, P("a3"))), "someone else"));
  await check("Dan, of another household, cannot even find it", async () => refused(() => as(dan, move(ANN_GCASH, P("a3"))), "no longer here"));
  await check("Ann cannot give it to Abe, a grown-up", async () => refused(() => as(ann, move(ANN_GCASH, P("a4"))), "Choose yourself"));
  await check("Nor to Kid, who has a login", async () => refused(() => as(ann, move(ANN_GCASH, P("a2"))), "Choose yourself"));
  await check("Nor to Dan, in another household", async () => refused(() => as(ann, move(ANN_GCASH, P("d1"))), "Choose yourself"));
  await check("Nor can Ann move Dan's account", async () => refused(() => as(ann, move(DAN_BANK, null)), "no longer here"));

  await check("Ann moves her account to Baby, a managed child", async () => {
    await as(ann, move(ANN_GCASH, P("a3")));
    const [a] = await q(`select is_joint, owner_member_id, is_private from accounts where id = '${ANN_GCASH}'`);
    return a.is_joint === false && a.owner_member_id === P("a3") && a.is_private === false;
  });
  await check("The movement that was simply Ann's is Baby's now", async () => (await owner(mine.id)).owner_member_id === P("a3"));
  await check("The one tagged to Abe stays Abe's; the family's stays the family's", async () =>
    (await owner(abes.id)).owner_member_id === P("a4") && (await owner(family.id)).is_joint === true);
  await check("Ann's list of viewers went with it", async () =>
    (await q(`select 1 from account_viewers where account_id = '${ANN_GCASH}'`)).length === 0);
  await check("Abe, a grown-up, sees Baby's account and can move it to the family", async () => {
    if ((await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length !== 1) return false;
    await as(abe, move(ANN_GCASH, null));
    const [a] = await q(`select is_joint, owner_member_id from accounts where id = '${ANN_GCASH}'`);
    const m = await owner(mine.id);
    return a.is_joint === true && a.owner_member_id === null && m.is_joint === true && m.owner_member_id === null;
  });
  await check("From the family to Baby, the family's movements go with it", async () => {
    await as(ann, move(ANN_GCASH, P("a3")));
    return (await owner(mine.id)).owner_member_id === P("a3") && (await owner(family.id)).owner_member_id === P("a3") && (await owner(abes.id)).owner_member_id === P("a4");
  });
  await check("Moving it where it already is changes nothing", async () => {
    await as(ann, move(ANN_GCASH, P("a3")));
    return (await owner(abes.id)).owner_member_id === P("a4");
  });
  await check("Ann takes it back as her own", async () => {
    await as(ann, move(ANN_GCASH, P("a1")));
    return (await owner(mine.id)).owner_member_id === P("a1");
  });
}
