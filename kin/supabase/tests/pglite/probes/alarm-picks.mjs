const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const ITEM = "c1000000-0000-0000-0000-000000000001";
const ITEM2 = "c1000000-0000-0000-0000-000000000002";
// Which plans, check-ups and bills ring as a real alarm in the Kin iPhone
// app, per person (20261029100000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), stranger = U("ff");
  const pick = (who, member, family, kind = "activity", item = ITEM) =>
    as(who, "insert into alarm_picks (member_id, family_id, kind, item_id) values ($1, $2, $3, $4)", [member, family, kind, item]);
  const mine = async (who) => (await as(who, "select member_id, kind, item_id from alarm_picks")).map((r) => `${r.member_id}|${r.kind}|${r.item_id}`);

  await check("Ann picks a plan and a bill, and sees exactly those", async () => {
    await pick(ann, M("a1"), A);
    await pick(ann, M("a1"), A, "bill", ITEM2);
    const r = await mine(ann);
    return (r.length === 2 && r.every((x) => x.startsWith(M("a1")))) || r;
  });
  await check("A child with a login picks their own, and sees only their own", async () => {
    await pick(kid, M("a2"), A, "appointment");
    const r = await mine(kid);
    return (r.length === 1 && r[0] === `${M("a2")}|appointment|${ITEM}`) || r;
  });
  await check("Nobody picks in someone else's name, in the household or not", async () => {
    const a = await refused(() => pick(ann, M("a2"), A, "bill"));
    const b = await refused(() => pick(ben, M("a1"), A, "bill"));
    return (a === true && b === true) || { a, b };
  });
  await check("Nobody files a pick under another household", async () =>
    (await refused(() => pick(ann, M("a1"), B, "appointment"))) === true);
  await check("Ben, in another household, sees none of Ann's", async () => (await mine(ben)).length === 0);
  await check("Only the three kinds are accepted", async () => (await refused(() => pick(ann, M("a1"), A, "birthday"))) === true);
  await check("A stranger and anon can neither read nor add", async () => {
    const s = await refused(() => pick(stranger, M("a1"), A, "bill"));
    const r = await mine(stranger);
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from alarm_picks").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (s === true && r.length === 0 && anonRead === true) || { s, r, anonRead };
  });
  await check("No update: a pick is added or removed, never moved to someone else", async () => {
    const r = await refused(() => as(ann, "update alarm_picks set member_id = $1", [M("a2")]));
    const moved = (await db.query("select count(*)::int as n from alarm_picks where member_id = $1 and kind = 'activity'", [M("a2")])).rows[0].n;
    return (r === true && moved === 0) || { r, moved };
  });
  await check("Ann removes her own; the child's stays", async () => {
    await as(ann, "delete from alarm_picks where kind = 'bill'");
    await as(kid, "delete from alarm_picks where member_id = $1", [M("a1")]);
    const a = await mine(ann);
    const k = await mine(kid);
    return (a.length === 1 && k.length === 1) || { a, k };
  });
  await check("Losing the login (account deletion keeps the row) clears that person's picks", async () => {
    await db.query("update members set auth_user_id = null where id = $1", [M("a2")]);
    const n = (await db.query("select count(*)::int as n from alarm_picks where member_id = $1", [M("a2")])).rows[0].n;
    const left = (await db.query("select count(*)::int as n from alarm_picks where member_id = $1", [M("a1")])).rows[0].n;
    return (n === 0 && left === 1) || { n, left };
  });
  await check("A change that keeps the login and the household leaves picks alone", async () => {
    await db.query("update members set full_name = 'Ann Anne' where id = $1", [M("a1")]);
    return (await mine(ann)).length === 1;
  });
  await check("Nobody calls alarm_picks_follow_member() directly", async () => {
    const r = (await db.query("select has_function_privilege('authenticated', 'public.alarm_picks_follow_member()', 'execute') as a")).rows[0];
    return r.a === false || r;
  });
}
