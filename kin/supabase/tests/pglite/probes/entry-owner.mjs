// Whose an entry or a bill is (20261023120000_entry_owner): left unsaid it
// takes the account's owner -- joint is the family's -- or, for a bill, the
// household's; an owner has to be someone in the same household. Run as the
// database owner: the trigger refuses a forged owner whoever writes it.
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const entry = (account, extra = "", values = "") =>
  `insert into wealth_transactions (family_id, account_id, direction, amount, particulars${extra}) values ('${A}', '${account}', 'in', 100, 'probe'${values}) returning is_joint, owner_member_id`;

export default async function ({ db, check, refused }) {
  const q = async (sql) => (await db.query(sql)).rows;

  await check("Left unsaid, an entry on the joint account is the family's", async () => {
    const [r] = await q(entry(JOINT));
    return r.is_joint === true && r.owner_member_id === null;
  });
  await check("Left unsaid, an entry on Ann's own account is Ann's", async () => {
    const [r] = await q(entry(ANN_GCASH));
    return r.is_joint === false && r.owner_member_id === P("a1");
  });
  await check("Said outright: Kid's salary paid into the joint account is Kid's", async () => {
    const [r] = await q(entry(JOINT, ", is_joint, owner_member_id", `, false, '${P("a2")}'`));
    return r.is_joint === false && r.owner_member_id === P("a2");
  });
  await check("Family means no owner, even if one is passed", async () => {
    const [r] = await q(entry(ANN_GCASH, ", is_joint, owner_member_id", `, true, '${P("a1")}'`));
    return r.is_joint === true && r.owner_member_id === null;
  });
  await check("Dan, of another household, can't be made an entry's owner", async () =>
    refused(() => q(entry(JOINT, ", is_joint, owner_member_id", `, false, '${P("d1")}'`)), "not in this household"));
  await check("Nor can an entry be someone's with nobody named", async () =>
    refused(() => q(entry(JOINT, ", is_joint", ", false"))));
  await check("Moving an entry to Dan afterwards is refused too", async () =>
    refused(() => q(`update wealth_transactions set is_joint = false, owner_member_id = '${P("d1")}' where account_id = '${JOINT}'`), "not in this household"));

  await check("A bill left unsaid is the household's; one given an owner is theirs", async () => {
    const [b1] = await q(`insert into bills (family_id, name) values ('${A}', 'Meralco') returning is_joint, owner_member_id`);
    const [b2] = await q(`insert into bills (family_id, name, owner_member_id) values ('${A}', 'Phone', '${P("a1")}') returning is_joint, owner_member_id`);
    return b1.is_joint === true && b1.owner_member_id === null && b2.is_joint === false && b2.owner_member_id === P("a1");
  });
  await check("Expected income can't be Dan's either", async () =>
    refused(() => q(`insert into income_schedules (family_id, name, amount, is_joint, owner_member_id) values ('${A}', 'Pay', 100, false, '${P("d1")}')`), "not in this household"));
  await check("A bill can't be Dan's either", async () =>
    refused(() => q(`insert into bills (family_id, name, is_joint, owner_member_id) values ('${A}', 'X', false, '${P("d1")}')`), "not in this household"));
}
