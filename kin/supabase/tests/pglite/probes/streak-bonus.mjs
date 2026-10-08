const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
// Streak bonus amounts per household, from the day they are set (20261008110100).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  // Parent-set rates only; the two seeded rows have no set_by.
  const rates = () => as(ann, "select seven, thirty, effective_from, set_by from streak_bonus_rates where set_by is not null order by created_at");
  await check("Existing households are seeded once: 1 before today, 10/50 from today (despite the migration running twice)", async () => {
    const r = await as(ann, "select seven, thirty, effective_from::text d, effective_from = (now() at time zone 'Asia/Manila')::date today from streak_bonus_rates order by effective_from");
    return (r.length === 2 && r[0].seven === 1 && r[0].thirty === 1 && r[0].d === "2000-01-01" && r[1].seven === 10 && r[1].thirty === 50 && r[1].today === true) || r;
  });
  await check("Ann (a parent) sets one: dated today, signed by her", async () => {
    await as(ann, "select set_streak_bonus(15, 75)");
    const r = await rates();
    return (r.length === 1 && r[0].seven === 15 && r[0].thirty === 75 && r[0].set_by === "00000000-0000-0000-0000-0000000000a1" && !!r[0].effective_from) || r;
  });
  await check("A second change adds a row; the first stays as it was", async () => {
    await as(ann, "select set_streak_bonus(20, 80)");
    const r = await rates();
    return (r.length === 2 && r[0].seven === 15 && r[1].seven === 20) || r;
  });
  await check("Kid reads them but can't set, insert, edit or delete one", async () => {
    const seen = (await as(kid, "select 1 from streak_bonus_rates where set_by is not null")).length;
    const fn = await refused(() => as(kid, "select set_streak_bonus(500, 1000)"));
    const ins = await refused(() => as(kid, "insert into streak_bonus_rates (family_id, effective_from, seven, thirty) values ($1, current_date - 30, 500, 1000)", [A]));
    await as(kid, "update streak_bonus_rates set seven = 500").catch(() => null);
    await as(kid, "delete from streak_bonus_rates").catch(() => null);
    const r = await rates();
    return (seen === 2 && fn === true && ins === true && r.length === 2 && r[0].seven === 15) || { seen, fn, ins, r };
  });
  await check("Ann can't backdate or rewrite one either", async () => {
    const ins = await refused(() => as(ann, "insert into streak_bonus_rates (family_id, effective_from, seven, thirty) values ($1, current_date - 30, 1, 1)", [A]));
    await as(ann, "update streak_bonus_rates set effective_from = current_date - 30, seven = 999").catch(() => null);
    const r = await rates();
    const old = await as(ann, "select seven from streak_bonus_rates where effective_from = '2000-01-01'");
    return (ins === true && old[0]?.seven === 1 && r.every((x) => x.seven !== 999 && String(x.effective_from) === String(r[0].effective_from))) || { ins, r, old };
  });
  await check("Out-of-range refused; Ben neither sees nor sets House A's", async () => {
    const big = await refused(() => as(ann, "select set_streak_bonus(5000, 50)"));
    await as(ben, "select set_streak_bonus(1, 1)");
    const benSees = (await as(ben, "select family_id from streak_bonus_rates")).every((x) => x.family_id !== A);
    // Ben's own household got its seed too, and his change is his own.
    return (big === true && benSees && (await rates()).length === 2) || { big, benSees };
  });
}
