// A goal's milestone and "Remind" on a deposit reach the phone, and only the
// people they are for (20261030190000_money_pushes.sql).
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const annM = M("a1"), kidM = M("a2"), abeM = M("a4"), benM = M("b1");
  const all = [annM, kidM, abeM, benM];
  // Every bill switch on, and Abe (joined after the devices) with a phone.
  await db.exec(`
    update members set notification_prefs = '{}';
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) select id, family_id, 'https://push/'||full_name, 'k', 'a' from members where id = '${abeM}';
  `);
  const targets = async (who, ids, source) =>
    (await as(who, "select endpoint from push_targets('bills', $1::uuid[], $2::uuid) order by 1", [ids, source])).map((r) => r.endpoint.split("/").pop());
  const same = (got, want) => JSON.stringify(got) === JSON.stringify(want) || got;
  const goal = async (owner, milestone) =>
    (await db.query(`insert into planner_goals (family_id, title, kind, target, period, owner_member_id, milestone) values ($1, 'Fund', 'money', 1000, 'total', $2, $3) returning id`, [A, owner, milestone])).rows[0].id;
  const record = async (who, by, row) =>
    (await as(who, "insert into money_pushes (family_id, created_by, what, ref, step, recipient) values ($1, $2, $3, $4, $5, $6) returning id", [row.family ?? A, by, row.what, row.ref, row.step ?? null, row.recipient ?? null]))[0].id;

  await check("A made-up label for a source is refused, as the code used to send it", async () =>
    refused(() => as(ann, "select * from push_targets('bills', $1::uuid[], 'goal-milestone:x:50')", [[abeM]])));

  const household = await goal(null, 50);
  const annPush = await record(ann, annM, { what: "milestone", ref: household, step: 50 });
  await check("The household's goal at halfway: the other grown-up, not the child, not Ann, not another household", async () => same(await targets(ann, all, annPush), ["Abe A"]));
  await check("Once: asking again for the same push hands out nothing", async () => same(await targets(ann, all, annPush), []));
  await check("The next step is a push of its own", async () => {
    await db.query("update planner_goals set milestone = 75 where id = $1", [household]);
    return same(await targets(ann, all, await record(ann, annM, { what: "milestone", ref: household, step: 75 })), ["Abe A"]);
  });
  await check("Not before the goal's step is claimed", async () => {
    const g = await goal(null, 25);
    return same(await targets(ann, all, await record(ann, annM, { what: "milestone", ref: g, step: 50 })), []);
  });
  await check("A child's own goal: the child", async () => {
    const g = await goal(kidM, 100);
    return same(await targets(ann, all, await record(ann, annM, { what: "milestone", ref: g, step: 100 })), ["Kid A"]);
  });
  await check("Someone else's push can't be used by another member", async () => {
    const p = await record(ann, annM, { what: "milestone", ref: await goal(null, 50), step: 50 });
    return same(await targets(abe, all, p), []);
  });
  await check("An old one warrants nothing", async () => {
    const p = await record(ann, annM, { what: "milestone", ref: await goal(null, 50), step: 50 });
    await db.query("update money_pushes set created_at = now() - interval '10 minutes' where id = $1", [p]);
    return same(await targets(ann, all, p), []);
  });

  const [savings] = (await db.query("insert into goals (family_id, title) values ($1, 'Trip') returning id", [A])).rows;
  const [theirs] = (await db.query("insert into goals (family_id, title) values ($1, 'Theirs') returning id", [B])).rows;
  await check("Remind: Ann reminds Kid, and only Kid", async () =>
    same(await targets(ann, all, await record(ann, annM, { what: "deposit", ref: savings.id, recipient: kidM })), ["Kid A"]));
  await check("A child can't send one", async () =>
    same(await targets(kid, all, await record(kid, kidM, { what: "deposit", ref: savings.id, recipient: abeM })), []));
  await check("Not for another household's goal", async () =>
    same(await targets(ann, all, await record(ann, annM, { what: "deposit", ref: theirs.id, recipient: kidM })), []));
  await check("Nor to someone in another household", async () =>
    same(await targets(ann, all, await record(ann, annM, { what: "deposit", ref: savings.id, recipient: benM })), []));

  await check("Nobody records one in someone else's name or household", async () => {
    const a = await refused(() => record(ann, abeM, { what: "deposit", ref: savings.id, recipient: kidM }));
    const b = await refused(() => record(ben, benM, { family: A, what: "deposit", ref: savings.id, recipient: kidM }));
    return (a === true && b === true) || { a, b };
  });
  await check("Shape: a milestone has a step and no one named; a reminder the reverse", async () => {
    const a = await refused(() => record(ann, annM, { what: "milestone", ref: household, step: 50, recipient: kidM }));
    const b = await refused(() => record(ann, annM, { what: "deposit", ref: savings.id }));
    const c = await refused(() => record(ann, annM, { what: "milestone", ref: household, step: 40 }));
    return (a === true && b === true && c === true) || { a, b, c };
  });
  await check("Each reads only their own; no change, no delete; anon nothing", async () => {
    const abeSees = (await as(abe, "select id from money_pushes")).length;
    const benSees = (await as(ben, "select id from money_pushes")).length;
    const upd = await refused(() => as(ann, "update money_pushes set recipient = $1", [abeM]));
    const del = await refused(() => as(ann, "delete from money_pushes"));
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from money_pushes").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (abeSees === 0 && benSees === 0 && upd === true && del === true && anonRead === true) || { abeSees, benSees, upd, del, anonRead };
  });
  await check("money_push_grownups is the warrant's own, not callable by anyone", async () =>
    refused(() => as(ann, "select public.money_push_grownups($1)", [A])));
  await check("At most 30 an hour", async () => {
    for (let i = 0; i < 30; i++) await record(ann, annM, { what: "deposit", ref: savings.id, recipient: abeM });
    return same(await targets(ann, all, await record(ann, annM, { what: "deposit", ref: savings.id, recipient: abeM })), []);
  });
}
