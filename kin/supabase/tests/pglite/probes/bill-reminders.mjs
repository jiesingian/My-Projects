const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// A bill a set number of days ahead (20261007170000_bill_reminder_days).
// 7 October 2026, 10:00 in Manila is 02:00 UTC.
export default async function ({ db, check, refused }) {
  const at = (day, hhmm = "02:00") => `2026-10-${day} ${hhmm}+00`;
  const due = async (now) => (await db.query("select * from due_bill_ahead_reminders($1, $2)", [SECRET, now])).rows;
  await db.query(
    `insert into bills (family_id, name, amount, due_date, remind_days_before, status) values
      ($1, 'Meralco', 3200, '2026-10-10', 3, 'unpaid'),
      ($1, 'Water', 600, '2026-10-14', 7, 'unpaid'),
      ($1, 'PLDT', 1700, '2026-10-10', 5, 'unpaid'),
      ($1, 'Rent', 20000, '2026-10-08', 1, 'unpaid'),
      ($1, 'Paid already', 100, '2026-10-10', 3, 'paid'),
      ($2, 'Dan power', 900, '2026-10-10', 3, 'unpaid')`,
    [A, D],
  );
  await check("A new bill is reminded 3 days ahead unless it says otherwise", async () => {
    const r = await db.query("insert into bills (family_id, name, amount) values ($1, 'x', 1) returning remind_days_before", [A]);
    await db.query("delete from bills where name = 'x'");
    return r.rows[0].remind_days_before === 3;
  });
  await check("0 or 31 days is refused", async () =>
    (await refused(() => db.query("insert into bills (family_id, name, amount, remind_days_before) values ($1, 'y', 1, 0)", [A]))) &&
    (await refused(() => db.query("insert into bills (family_id, name, amount, remind_days_before) values ($1, 'y', 1, 31)", [A]))));
  // House D keeps its own clock: New York, 12 hours behind Manila.
  await db.query("update families set time_zone = 'America/New_York' where id = $1", [D]);
  await check("A wrong secret gets nothing", async () => (await db.query("select * from due_bill_ahead_reminders('nope', $1)", [at("07")])).rows.length === 0);
  await check("Before 09:00 Manila: nothing", async () => (await due(at("07", "00:30"))).length === 0);
  let rows;
  await check("7 Oct: Meralco (3 days) and Water (7 days), not PLDT, Rent or the paid one", async () => {
    rows = await due(at("07"));
    const titles = [...new Set(rows.filter((r) => r.endpoint !== "https://push/Dan D").map((r) => r.title))].sort();
    return (titles.join("|") === "Meralco is due in 3 days|Water is due in 7 days") || titles;
  });
  await check("Ann's grown-ups get House A's bills; children get none; House D, still 6 Oct 22:00 in New York, nothing yet", async () => {
    const who = rows.map((r) => `${r.endpoint.split("/").pop()}: ${r.title}`).sort();
    return who.join("|") === "Ann A: Meralco is due in 3 days|Ann A: Water is due in 7 days" || who;
  });
  await check("New York's 7 Oct, 10:00 (14:00 UTC): Dan gets his own bill, three days out", async () => {
    const who = (await due(at("07", "14:00"))).map((r) => `${r.endpoint.split("/").pop()}: ${r.title}`);
    return who.join("|") === "Dan D: Dan power is due in 3 days" || who;
  });
  await check("Says the day it is due", async () => rows.find((r) => r.title.startsWith("Meralco")).body === "Due Saturday 10 Oct. Tap to pay or mark it paid.");
  await check("Once only", async () => (await due(at("07", "03:00"))).length === 0);
  await check("5 Oct: PLDT, its own 5 days ahead", async () => (await due(at("05"))).map((r) => r.title).every((t) => t === "PLDT is due in 5 days"));
  await check("Switched bills off: nothing", async () => {
    await db.query("update members set notification_prefs = '{\"bills\": false}' where family_id = $1", [A]);
    await db.query("update bills set due_date = '2026-10-12' where name = 'Meralco'");
    const n = (await due(at("09"))).length;
    await db.query("update members set notification_prefs = '{}' where family_id = $1", [A]);
    return n === 0 || n;
  });
}
