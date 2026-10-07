const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
// Streak bonus amounts per household (20261007130000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  // Stand-in: a household-wide update policy, the loosest the real one could be.
  await db.exec("grant update on families to authenticated; create policy f_upd on families for update using (id = current_family_id())");
  const bonus = async () => (await db.query(`select streak_bonus_7 s7, streak_bonus_30 s30 from families where id = '${A}'`)).rows[0];
  await check("Defaults are 10 and 50", async () => {
    const b = await bonus();
    return (b.s7 === 10 && b.s30 === 50) || b;
  });
  await check("Ann (a parent) sets them for her household only", async () => {
    await as(ann, "select set_streak_bonus(15, 75)");
    const b = await bonus();
    const other = (await db.query("select streak_bonus_7 s7 from families where id = 'b0000000-0000-0000-0000-000000000000'")).rows[0];
    return (b.s7 === 15 && b.s30 === 75 && other.s7 === 10) || { b, other };
  });
  await check("Kid can't change them, by function or by direct update", async () => {
    const fn = await refused(() => as(kid, "select set_streak_bonus(500, 1000)"));
    const direct = await refused(() => as(kid, "update families set streak_bonus_7 = 500"), "Only a parent");
    const b = await bonus();
    return (fn === true && direct === true && b.s7 === 15) || { fn, direct, b };
  });
  await check("Out-of-range amounts are refused; Ben can't touch House A", async () => {
    const big = await refused(() => as(ann, "select set_streak_bonus(5000, 50)"));
    await as(ben, "select set_streak_bonus(1, 1)");
    const b = await bonus();
    return (big === true && b.s7 === 15) || { big, b };
  });
}
