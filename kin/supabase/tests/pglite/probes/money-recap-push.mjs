const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
// The monthly money recap push (20261020001000): on the 1st, from 08:00 in
// the household's own zone, to its grown-ups only, once a month, only where
// money moved last month -- and saying no amount at all.
export default async function ({ db, check }) {
  const run = async (at, secret = SECRET) => (await db.query("select * from due_money_recap_reminders($1, $2)", [secret, at])).rows;
  const who = (rows) => [...new Set(rows.map((r) => r.endpoint.split("/").pop()))].sort().join("|");

  await db.exec("insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) select id, family_id, 'https://push/' || full_name, 'k', 'a' from members m where full_name = 'Abe A' and not exists (select 1 from push_subscriptions s where s.member_id = m.id)");
  // House A moved money in September; House B did not.
  await db.query("insert into accounts (id, family_id, name, is_joint) values ('e0000000-0000-0000-0000-000000000001', $1, 'Joint', true)", [A]);
  await db.query("insert into wealth_transactions (family_id, account_id, direction, amount, particulars, occurred_at) values ($1, 'e0000000-0000-0000-0000-000000000001', 'out', 1234.5, 'Groceries', '2026-09-20 03:00+00')", [A]);

  await check("A wrong secret gets nothing", async () => (await run("2026-10-01 02:00+00", "nope")).length === 0);
  await check("Not on the 2nd", async () => (await run("2026-10-02 02:00+00")).length === 0);
  await check("Not before 08:00 Manila on the 1st", async () => (await run("2026-09-30 23:30+00")).length === 0);
  await check("On the 1st at 10:00 Manila: House A's grown-ups only (Ann, Abe), not the child, not House B", async () => {
    const rows = await run("2026-10-01 02:00+00");
    return who(rows) === "Abe A|Ann A" || who(rows);
  });
  await check("Not twice in the month", async () => (await run("2026-10-01 05:00+00")).length === 0);
  await check("It names the month and opens the recap, with no amount", async () => {
    await db.exec("delete from reminder_sends");
    const r = (await run("2026-10-01 02:00+00"))[0];
    return (r.title === "Your September money recap" && r.url === "/wealth/recap?month=2026-09" && !/\d/.test(r.body)) || r;
  });
  await check("A grown-up who turned it off hears nothing", async () => {
    await db.exec("delete from reminder_sends");
    await db.exec("update members set notification_prefs = '{\"money_recap\": false}' where full_name = 'Abe A'");
    return who(await run("2026-10-01 02:00+00")) === "Ann A";
  });
  await check("Money from October does not count for September's recap", async () => {
    await db.exec("delete from reminder_sends; delete from wealth_transactions");
    await db.query("insert into wealth_transactions (family_id, account_id, direction, amount, particulars, occurred_at) values ($1, 'e0000000-0000-0000-0000-000000000001', 'out', 50, 'Load', '2026-09-30 17:00+00')", [A]);
    return (await run("2026-10-01 02:00+00")).length === 0;
  });
  await check("A grown-up with no device yet keeps the month: once they turn push on that day, they hear it", async () => {
    await db.exec("delete from reminder_sends; delete from wealth_transactions; delete from push_subscriptions where endpoint = 'https://push/Abe A'");
    await db.exec("update members set notification_prefs = '{}' where full_name = 'Abe A'");
    await db.query("insert into wealth_transactions (family_id, account_id, direction, amount, particulars, occurred_at) values ($1, 'e0000000-0000-0000-0000-000000000001', 'out', 80, 'Jeep', '2026-09-10 03:00+00')", [A]);
    const before = who(await run("2026-10-01 02:00+00"));
    await db.exec("insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) select id, family_id, 'https://push/Abe A', 'k', 'a' from members where full_name = 'Abe A'");
    const after = who(await run("2026-10-01 06:00+00"));
    return (before === "Ann A" && after === "Abe A") || [before, after];
  });
}
