// An account's QR code (20261027170000): who sees it is the account number's
// rule -- the owner always; on a joint or shared account, the household's
// grown-ups; not a child, not another member for a private account, not
// another household. Set by the owner of a personal account, or any grown-up
// on a joint one, in their own name; only a small image.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_PRIVATE = "a4000000-0000-0000-0000-000000000002";
const ANN_SHARED = "a4000000-0000-0000-0000-00000000000a";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";
const IMG = "data:image/png;base64,iVBORw0KGgo=";
const put = (account, by, family = A, image = IMG) =>
  `insert into account_qr_codes (account_id, family_id, image, updated_by) values ('${account}', '${family}', '${image}', '${by}') returning account_id`;
const sees = async (as, who, account) => (await as(who, `select 1 from account_qr_codes where account_id = '${account}'`)).length === 1;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  await db.exec("reset role");
  await db.exec(`insert into accounts (id, family_id, name, is_joint, owner_member_id, is_private) values ('${ANN_SHARED}', '${A}', 'Ann shared QR', false, '${P("a1")}', false)`);

  await check("Ann puts a QR on her private and her shared account", async () =>
    (await as(ann, put(ANN_PRIVATE, P("a1")))).length === 1 && (await as(ann, put(ANN_SHARED, P("a1")))).length === 1);
  await check("Abe (an adult) puts one on the joint account", async () => (await as(abe, put(JOINT, P("a4")))).length === 1);

  await check("Ann sees all three", async () => (await sees(as, ann, ANN_PRIVATE)) && (await sees(as, ann, ANN_SHARED)) && (await sees(as, ann, JOINT)));
  await check("Abe sees the joint and Ann's shared one, not her private one", async () =>
    (await sees(as, abe, JOINT)) && (await sees(as, abe, ANN_SHARED)) && !(await sees(as, abe, ANN_PRIVATE)));
  await check("Kid sees none of them", async () => (await as(kid, "select 1 from account_qr_codes")).length === 0);
  await check("Dan (another household) sees none", async () => (await as(dan, "select 1 from account_qr_codes")).length === 0);

  await check("Abe cannot set, change or remove Ann's", async () =>
    (await refused(() => as(abe, `insert into account_qr_codes (account_id, family_id, image, updated_by) values ('${ANN_SHARED}', '${A}', '${IMG}', '${P("a4")}') on conflict (account_id) do update set image = excluded.image, updated_by = excluded.updated_by returning 1`))) === true &&
    (await as(abe, `delete from account_qr_codes where account_id = '${ANN_SHARED}' returning 1`)).length === 0);
  await check("Kid cannot change or remove the joint account's", async () =>
    (await as(kid, `update account_qr_codes set updated_by = '${P("a2")}' where account_id = '${JOINT}' returning 1`)).length === 0 &&
    (await as(kid, `delete from account_qr_codes where account_id = '${JOINT}' returning 1`)).length === 0);
  await check("Nobody writes one in someone else's name", async () => refused(() => as(ann, `update account_qr_codes set updated_by = '${P("a4")}' where account_id = '${JOINT}' returning 1`)));
  await check("Dan cannot put one on House A's account, nor file his own under House A", async () =>
    (await refused(() => as(dan, put(JOINT, P("d1"))))) === true && (await refused(() => as(dan, put(DAN_BANK, P("d1"), A)))) === true);
  await check("Only an image, and only a small one", async () =>
    (await refused(() => as(ann, `update account_qr_codes set image = 'javascript:alert(1)' where account_id = '${ANN_PRIVATE}' returning 1`))) === true &&
    (await refused(() => as(ann, `update account_qr_codes set image = 'data:image/png;base64,' || repeat('A', 400000) where account_id = '${ANN_PRIVATE}' returning 1`))) === true);
  await check("can_set_account_qr: the owner yes; another grown-up, a child, another household no", async () => {
    const can = async (who, account, family = A) => (await as(who, "select public.can_set_account_qr($1, $2) as ok", [account, family]))[0].ok;
    return (await can(ann, ANN_SHARED)) === true && (await can(abe, ANN_SHARED)) === false && (await can(kid, JOINT)) === false && (await can(dan, JOINT)) === false && (await can(abe, JOINT)) === true;
  });
  await check("Ann removes her own", async () => (await as(ann, `delete from account_qr_codes where account_id = '${ANN_SHARED}' returning 1`)).length === 1);
  await check("Deleting the account takes its QR with it", async () => {
    await db.exec("reset role");
    const id = (await db.query(`insert into accounts (family_id, name, owner_member_id) values ($1, 'Short-lived', $2) returning id`, [A, P("a1")])).rows[0].id;
    await db.query(`insert into account_qr_codes (account_id, family_id, image) values ($1, $2, $3)`, [id, A, IMG]);
    await db.query("delete from accounts where id = $1", [id]);
    return (await db.query("select 1 from account_qr_codes where account_id = $1", [id])).rows.length === 0;
  });
}
