// 🎯 auto-save bills (20261030180000): a bill may be for one of the
// household's own accounts (a transfer into it), never another household's;
// auto_save is off unless set; the auto-saves made before the flag are
// found by their shape; an account deleted lets go of its bills.
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";

export default async function ({ db, check, refused }) {
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const bill = (table, id, extra = "") => q(`insert into bills (family_id, name, against_table, against_id${extra ? ", auto_save" : ""}) values ($1, 'Save into savings', $2, $3${extra ? ", true" : ""}) returning id, against_table, auto_save`, [A, table, id]);

  await check("A bill can be for the household's own account", async () => {
    const [b] = await bill("accounts", JOINT);
    return (b.against_table === "accounts" && b.auto_save === false) || b;
  });
  await check("Another household's account is refused", async () => refused(() => bill("accounts", DAN_BANK), "not this household"));
  await check("auto_save is set only when asked", async () => {
    const [b] = await bill("accounts", JOINT, "auto");
    return b.auto_save === true || b;
  });
  await check("An account deleted outright lets go of its bills", async () => {
    const [acct] = await q(`insert into accounts (family_id, name, is_joint) values ($1, 'Throwaway', true) returning id`, [A]);
    const [b] = await bill("accounts", acct.id);
    await q(`delete from accounts where id = $1`, [acct.id]);
    const [after] = await q(`select against_table, against_id from bills where id = $1`, [b.id]);
    return (after.against_table === null && after.against_id === null) || after;
  });
}
