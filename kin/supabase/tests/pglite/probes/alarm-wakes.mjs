const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const PLAN = "c1000000-0000-0000-0000-000000000001";
const OTHER = "c1000000-0000-0000-0000-000000000002";
const BILL = "c1000000-0000-0000-0000-000000000003";
const TOKEN = (c) => `https://api.push.apple.com/3/device/${c.repeat(64)}`;
// The silent push that keeps the iPhone app's alarms topped up
// (20261029200000): each app phone once a day from 03:00 in its household's
// zone, and within a tick of a change that moves an alarm -- only the app's
// alert token, never its VoIP one, never a browser.
export default async function ({ db, as, check, refused }) {
  // A change is stamped with the real clock (alarm_wake_mark: now()), and a
  // tick only takes changes made before it. The ticks below are fixed dates,
  // so a change queued during the test counts as made before the tick it is
  // asked at; else the probe failed once the real clock passed those dates
  // (29 October, 23:05 UTC).
  const run = async (at, secret = SECRET) => {
    await db.query("update alarm_wake_queue set changed_at = $1 where changed_at > $1", [at]);
    return (await db.query("select * from due_alarm_wakes($1, $2)", [secret, at])).rows;
  };
  const who = (rows) => rows.map((r) => `${r.endpoint.slice(-3)}:${r.reason}`).sort().join("|");
  const queued = async () => (await db.query("select family_id from alarm_wake_queue order by family_id")).rows.map((r) => r.family_id).join("|");

  // Ann has the app (alert + voip) and a browser; Kid has the app; Ben in
  // House B has the app.
  await db.exec("delete from push_subscriptions");
  await db.query(
    `insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values
      ($1, $4, $5, 'kin-native', 'alert'), ($1, $4, $6, 'kin-native', 'voip'), ($1, $4, 'https://web.push.apple.com/ann', 'BNc', 'x'),
      ($2, $4, $7, 'kin-native', 'alert'), ($3, $8, $9, 'kin-native', 'alert')`,
    [M("a1"), M("a2"), M("b1"), A, TOKEN("a"), TOKEN("v"), TOKEN("k"), B, TOKEN("b")],
  );
  await db.exec("delete from alarm_wake_queue; delete from reminder_sends");

  await check("A wrong secret gets nothing", async () => (await run("2026-10-29 20:00+00", "nope")).length === 0);
  await check("Not before 03:00 in the household's zone (02:00 Manila)", async () => (await run("2026-10-29 18:00+00")).length === 0);
  await check("From 03:00 Manila: every app phone once, on its alert token only", async () => {
    const r = await run("2026-10-29 19:05+00");
    return who(r) === "aaa:daily|bbb:daily|kkk:daily" || who(r);
  });
  await check("Not twice the same day", async () => (await run("2026-10-29 23:00+00")).length === 0);
  await check("Again the next day", async () => (await run("2026-10-30 19:05+00")).length === 3);

  await check("A medicine added, as a member through RLS, wakes only that household's phones at the next tick", async () => {
    await as(U("a1"), "insert into health_medicines (family_id, member_id, name, times, start_date, visibility) values ($1, $2, 'Losartan', '{08:00}', '2026-10-01', 'family')", [A, M("a1")]);
    const q = await queued();
    const r = await run("2026-10-30 22:00+00");
    return (q === A && who(r) === "aaa:changed|kkk:changed") || { q, r: who(r) };
  });
  await check("The queue empties once sent: the next tick sends nothing", async () => (await run("2026-10-30 22:05+00")).length === 0);
  await check("Many edits in a tick are one wake per phone", async () => {
    await db.exec("update health_medicines set dose = '50mg'; update health_medicines set dose = '100mg'");
    const r = await run("2026-10-30 22:10+00");
    return who(r) === "aaa:changed|kkk:changed" || who(r);
  });
  await check("A plan or bill nobody picked to ring wakes nothing", async () => {
    await db.query("insert into activities (id, family_id, title, start_at) values ($1, $2, 'Sunday lunch', '2026-11-01 04:00+00'), ($3, $2, 'Groceries', '2026-11-01 04:00+00')", [PLAN, A, OTHER]);
    await db.query("insert into bills (id, family_id, name, due_date) values ($1, $2, 'Meralco', '2026-11-05')", [BILL, A]);
    await db.exec("update activities set title = title || '!'; update bills set amount = 2");
    return (await queued()) === "" || (await queued());
  });
  await check("Picking a plan wakes the household, and so does then changing it", async () => {
    await db.query("insert into alarm_picks (member_id, family_id, kind, item_id) values ($1, $2, 'activity', $3)", [M("a1"), A, PLAN]);
    const first = await queued();
    await run("2026-10-30 22:15+00");
    await db.query("update activities set start_at = '2026-11-01 05:00+00' where id = $1", [PLAN]);
    const second = await queued();
    await db.query("update activities set title = 'Groceries!!' where id = $1", [OTHER]);
    return (first === A && second === A) || { first, second };
  });
  await check("A picked bill marked paid wakes the household", async () => {
    await run("2026-10-30 22:20+00");
    await db.query("insert into alarm_picks (member_id, family_id, kind, item_id) values ($1, $2, 'bill', $3)", [M("a1"), A, BILL]);
    await run("2026-10-30 22:25+00");
    await db.query("update bills set status = 'paid' where id = $1", [BILL]);
    return (await queued()) === A || (await queued());
  });
  await check("A change in House B wakes only Ben's phone", async () => {
    await run("2026-10-30 22:30+00");
    await db.query("insert into health_medicines (family_id, member_id, name, times, start_date) values ($1, $2, 'Metformin', '{07:00}', '2026-10-01')", [B, M("b1")]);
    const r = await run("2026-10-30 22:35+00");
    return who(r) === "bbb:changed" || who(r);
  });
  await check("A daily wake and a change at the same tick are one push per phone", async () => {
    await db.exec("delete from reminder_sends");
    await db.query("update health_medicines set dose = '1 tab' where family_id = $1", [A]);
    const r = await run("2026-10-31 19:05+00");
    return (r.length === 3 && new Set(r.map((x) => x.endpoint)).size === 3) || who(r);
  });
  await check("A member who left is not woken", async () => {
    await db.exec("delete from reminder_sends");
    await db.query("update members set status = 'removed' where id = $1", [M("a2")]);
    const r = await run("2026-11-01 19:05+00");
    await db.query("update members set status = 'active' where id = $1", [M("a2")]);
    return who(r) === "aaa:daily|bbb:daily" || who(r);
  });
  await check("A household deleted with its medicines leaves nothing queued, and doesn't fail", async () => {
    await run("2026-11-01 19:10+00");
    await db.query("insert into families (id, name) values ('e1000000-0000-0000-0000-000000000000', 'House Gone')");
    await db.query("insert into health_medicines (family_id, name, times, start_date) values ('e1000000-0000-0000-0000-000000000000', 'X', '{08:00}', '2026-10-01')");
    await db.exec("delete from alarm_wake_queue");
    await db.exec("delete from health_medicines where family_id = 'e1000000-0000-0000-0000-000000000000'; delete from families where id = 'e1000000-0000-0000-0000-000000000000'");
    return (await queued()) === "" || (await queued());
  });
  await check("Nobody signed in can read the queue or ask for the wakes", async () => {
    const read = await refused(() => as(U("a1"), "select * from alarm_wake_queue"));
    const mark = await refused(() => as(U("a1"), "select alarm_wake_mark()"));
    const ask = (await as(U("d1"), "select * from due_alarm_wakes('guess', now())")).length === 0;
    return (read && mark && ask) || { read, mark, ask };
  });
}
