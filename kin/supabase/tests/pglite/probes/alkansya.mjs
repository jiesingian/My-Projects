// Allowance and alkansya (20261019100000): grown-ups write, a child reads
// only their own jars and writes nothing, nothing crosses households, the
// baon pays itself once per payday, and a jar cannot go below nothing.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1"), dee = U("d2");
  const kidM = P("a2"), babyM = P("a3"), annM = P("a1"), deeM = P("d2");
  const today = (await db.query("select (now() at time zone 'Asia/Manila')::date::text d, extract(dow from (now() at time zone 'Asia/Manila'))::int w")).rows[0];

  const plan = (who, member, by) =>
    as(who, `insert into alkansya_plans (member_id, family_id, weekly_amount, pay_weekday, created_by) values ($1, $2, 100, ${today.w}, $3) returning member_id`, [member, A, by]);
  const entry = (who, { member = kidM, family = A, jar = "gastos", kind = "deposit", amount = 50, points = 0, by = annM } = {}) =>
    as(who, "insert into alkansya_entries (family_id, member_id, jar, kind, amount, points, recorded_by) values ($1, $2, $3, $4, $5, $6, $7) returning id", [family, member, jar, kind, amount, points, by]);
  const jar = async (who, member, j) => Number((await as(who, "select coalesce(sum(amount), 0) s from alkansya_entries where member_id = $1 and jar = $2", [member, j]))[0].s);

  await check("Ann sets Kid a weekly baon of 100, paid today's weekday", async () => (await plan(ann, kidM, annM)).length === 1);
  await check("The baon is paid once today, split 70 / 20 / 10", async () => {
    const paid = (await as(kid, "select alkansya_pay_allowances() n"))[0].n;
    const again = (await as(ann, "select alkansya_pay_allowances() n"))[0].n;
    return (paid === 1 && again === 0 && (await jar(ann, kidM, "gastos")) === 70 && (await jar(ann, kidM, "ipon")) === 20 && (await jar(ann, kidM, "bigay")) === 10) || { paid, again };
  });
  await check("Three weeks unopened are paid when someone next looks", async () => {
    await db.exec(`select set_config('kin.alkansya_paying', 'on', false); update alkansya_plans set paid_through = '${today.d}'::date - 21 where member_id = '${kidM}'; select set_config('kin.alkansya_paying', 'off', false);`);
    await db.exec(`delete from alkansya_entries where member_id = '${kidM}'`);
    const n = (await as(kid, "select alkansya_pay_allowances() n"))[0].n;
    return (n === 3 && (await jar(ann, kidM, "gastos")) === 210) || n;
  });
  await check("Editing the plan cannot move paid_through back for back pay", async () => {
    await as(ann, `update alkansya_plans set paid_through = '2020-01-01', weekly_amount = 120 where member_id = $1`, [kidM]);
    return (await as(ann, "select paid_through::text p from alkansya_plans where member_id = $1", [kidM]))[0].p === today.d;
  });

  await check("Switching the baon off and on again on a payday does not pay it twice", async () => {
    const count = async () => Number((await db.query(`select count(*) n from alkansya_entries where member_id = '${kidM}' and kind = 'allowance'`)).rows[0].n);
    const before = await count();
    await as(ann, "update alkansya_plans set active = false where member_id = $1", [kidM]);
    await as(ann, "update alkansya_plans set active = true where member_id = $1", [kidM]);
    const n = (await as(ann, "select alkansya_pay_allowances() n"))[0].n;
    return (n === 0 && (await count()) === before) || { n, before, after: await count() };
  });
  await check("Ann records points changed into pesos, a spend and a gift", async () =>
    (await entry(ann, { kind: "points", amount: 15, points: 30 })).length === 1 &&
    (await entry(ann, { kind: "spend", amount: -25 })).length === 1 &&
    (await entry(ann, { jar: "bigay", kind: "give", amount: -10 })).length === 1);
  await check("Abe (another grown-up) can add interest to ipon", async () => (await entry(abe, { jar: "ipon", kind: "interest", amount: 1.2, by: P("a4") })).length === 1);
  await check("A jar cannot be overdrawn", async () => refused(() => entry(ann, { jar: "bigay", kind: "give", amount: -999 }), "alkansya_not_enough"));
  await check("Interest only goes into ipon, a gift only out of bigay", async () =>
    (await refused(() => entry(ann, { jar: "gastos", kind: "interest", amount: 5 }))) === true &&
    (await refused(() => entry(ann, { jar: "gastos", kind: "give", amount: -5 }))) === true);
  await check("Nobody writes a baon by hand", async () => refused(() => entry(ann, { kind: "allowance", amount: 100 })));
  await check("Nobody records an entry in someone else's name", async () => refused(() => entry(abe, { by: annM })));
  await check("Points used are counted for the planner", async () => {
    const rows = await as(kid, "select member_id, points from alkansya_points_used()");
    return (rows.length === 1 && rows[0].member_id === kidM && Number(rows[0].points) === 30) || rows;
  });

  await check("Kid sees their own jars and plan", async () =>
    (await as(kid, "select 1 from alkansya_entries where member_id = $1", [kidM])).length > 0 &&
    (await as(kid, "select 1 from alkansya_plans where member_id = $1", [kidM])).length === 1);
  await check("Kid cannot give themselves money, a plan, or take an entry off", async () =>
    (await refused(() => entry(kid, { by: kidM }))) === true &&
    (await as(kid, "update alkansya_plans set weekly_amount = 5000 where member_id = $1 returning 1", [kidM])).length === 0 &&
    (await as(kid, "delete from alkansya_entries where member_id = $1 returning 1", [kidM])).length === 0);
  await check("Kid does not see a sibling's alkansya", async () => {
    await plan(ann, babyM, annM);
    await entry(ann, { member: babyM, amount: 40 });
    return (await as(kid, "select 1 from alkansya_entries where member_id = $1", [babyM])).length === 0 &&
      (await as(kid, "select 1 from alkansya_plans where member_id = $1", [babyM])).length === 0;
  });
  await check("A grown-up has no alkansya: plans and entries are for children", async () =>
    (await refused(() => plan(ann, annM, annM))) === true && (await refused(() => entry(ann, { member: annM }))) === true);
  await check("Ben (linked) and Dan (stranger) see nothing of House A's", async () =>
    (await as(ben, "select 1 from alkansya_entries")).length === 0 &&
    (await as(dan, "select 1 from alkansya_plans")).length === 0 &&
    (await as(dan, "select * from alkansya_points_used()")).length === 0);
  await check("Dan cannot write into House A, nor give House A's child a plan from his own", async () =>
    (await refused(() => entry(dan, { by: P("d1") }))) === true &&
    (await refused(() => as(dan, "insert into alkansya_plans (member_id, family_id, created_by) values ($1, $2, $3)", [kidM, D, P("d1")]))) === true);
  await check("Dan's own child Dee sees only Dee's", async () => {
    await as(dan, "insert into alkansya_plans (member_id, family_id, weekly_amount, created_by) values ($1, $2, 50, $3)", [deeM, D, P("d1")]);
    return (await as(dee, "select member_id from alkansya_plans")).every((r) => r.member_id === deeM);
  });
  await check("Ann can take an entry off; Kid's pay-run cannot pay another household", async () => {
    const id = (await entry(ann, { amount: 5 }))[0].id;
    const gone = (await as(ann, "delete from alkansya_entries where id = $1 returning 1", [id])).length === 1;
    const before = Number((await db.query(`select count(*) n from alkansya_entries where member_id = '${deeM}'`)).rows[0].n);
    await as(kid, "select alkansya_pay_allowances()");
    const after = Number((await db.query(`select count(*) n from alkansya_entries where member_id = '${deeM}'`)).rows[0].n);
    return (gone && before === after) || { gone, before, after };
  });
}
