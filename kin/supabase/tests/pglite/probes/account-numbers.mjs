// Account numbers (20261002100000): the owner always; on a joint or shared
// account, the household's grown-ups; nobody else -- not a child, not another
// member for a private account, not another household. Set by the owner of a
// personal account, or any grown-up on a joint one, in their own name.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_PRIVATE = "a4000000-0000-0000-0000-000000000002";
const ANN_SHARED = "a4000000-0000-0000-0000-000000000009";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";
const put = (account, by, number = "1234 5678 90", family = A) =>
  `insert into account_numbers (account_id, family_id, number, updated_by) values ('${account}', '${family}', '${number}', '${by}') returning account_id`;
const sees = async (as, who, account) => (await as(who, `select number from account_numbers where account_id = '${account}'`)).length === 1;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  await db.exec(`insert into accounts (id, family_id, name, is_joint, owner_member_id, is_private) values ('${ANN_SHARED}', '${A}', 'Ann shared', false, '${P("a1")}', false)`);

  await check("Ann numbers her private and her shared account", async () =>
    (await as(ann, put(ANN_PRIVATE, P("a1")))).length === 1 && (await as(ann, put(ANN_SHARED, P("a1"), "0011-2233"))).length === 1);
  await check("Abe (an adult) numbers the joint account", async () => (await as(abe, put(JOINT, P("a4"), "9988 7766"))).length === 1);

  await check("Ann sees all three", async () => (await sees(as, ann, ANN_PRIVATE)) && (await sees(as, ann, ANN_SHARED)) && (await sees(as, ann, JOINT)));
  await check("Abe sees the joint and Ann's shared one, not her private one", async () =>
    (await sees(as, abe, JOINT)) && (await sees(as, abe, ANN_SHARED)) && !(await sees(as, abe, ANN_PRIVATE)));
  await check("Kid sees none of them", async () => (await as(kid, "select 1 from account_numbers")).length === 0);
  await check("Dan (another household) sees none", async () => (await as(dan, "select 1 from account_numbers")).length === 0);

  await check("Abe cannot number, change or clear Ann's account", async () =>
    (await refused(() => as(abe, put(ANN_PRIVATE, P("a4"), "1111 1111")))) === true &&
    (await as(abe, `update account_numbers set number = '0000 0000', updated_by = '${P("a4")}' where account_id = '${ANN_SHARED}' returning 1`)).length === 0 &&
    (await as(abe, `delete from account_numbers where account_id = '${ANN_SHARED}' returning 1`)).length === 0);
  await check("Kid cannot change the joint account's number", async () =>
    (await as(kid, `update account_numbers set number = '0000 0000', updated_by = '${P("a2")}' where account_id = '${JOINT}' returning 1`)).length === 0);
  await check("Nobody writes one in someone else's name", async () => refused(() => as(ann, `update account_numbers set updated_by = '${P("a4")}' where account_id = '${JOINT}' returning 1`)));
  await check("Dan cannot number an account in House A, nor file his own under it", async () =>
    (await refused(() => as(dan, put(JOINT, P("d1"))))) === true && (await refused(() => as(dan, put(DAN_BANK, P("d1"), "1234 5678", A)))) === true);
  await check("Only digits, letters, spaces and dashes", async () => refused(() => as(ann, `update account_numbers set number = '<script>' where account_id = '${ANN_PRIVATE}' returning 1`)));
  await check("Deleting the account takes its number with it", async () => {
    await db.exec(`delete from accounts where id = '${ANN_SHARED}'`);
    return (await db.query(`select 1 from account_numbers where account_id = '${ANN_SHARED}'`)).rows.length === 0;
  });
}
