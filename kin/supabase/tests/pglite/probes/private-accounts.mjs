// Private accounts (2 October): another member of the household never sees
// one -- not the account, not its balance's movements -- so it cannot reach
// any list or total of theirs, which are all summed from what these policies
// return. base.sql carries the accounts / wealth_transactions SELECT policies
// as they stand since 9 September (joint OR mine OR NOT is_private).
// 20261002090000 adds the owner's own include-in-All-totals choice.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const ANN_GCASH = "a4000000-0000-0000-0000-000000000002";
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check }) {
  const ann = U("a1"), abe = U("a4"), kid = U("a2"), dan = U("d1");
  await db.exec(`insert into wealth_transactions (family_id, account_id, direction, amount, particulars) values ('${A}', '${ANN_GCASH}', 'in', 5000, 'private pay')`);

  await check("Ann sees her own private account and its movement", async () =>
    (await as(ann, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 1 &&
    (await as(ann, `select 1 from wealth_transactions where account_id = '${ANN_GCASH}'`)).length === 1);
  await check("Abe and Kid, in the same household, see neither", async () =>
    (await as(abe, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0 &&
    (await as(abe, `select 1 from wealth_transactions where account_id = '${ANN_GCASH}'`)).length === 0 &&
    (await as(kid, `select 1 from accounts where id = '${ANN_GCASH}'`)).length === 0);
  await check("So Abe's total of every movement he can see leaves Ann's private 5,000 out", async () =>
    Number((await as(abe, "select coalesce(sum(amount), 0) as s from wealth_transactions"))[0].s) === 0);
  await check("Dan, in another household, sees nothing of House A's accounts", async () =>
    (await as(dan, `select 1 from accounts where family_id = '${A}'`)).length === 0);
  await check("Everyone starts with private accounts counted in their own totals", async () =>
    (await as(ann, "select wealth_include_private from members where auth_user_id = auth.uid()"))[0].wealth_include_private === true);
}
