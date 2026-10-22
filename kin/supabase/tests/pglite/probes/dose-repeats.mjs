const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
const ANN = "00000000-0000-0000-0000-0000000000a1";
const KID = "00000000-0000-0000-0000-0000000000a2";
// A dose reminder comes back 5 and 10 minutes after the dose time while the
// dose is untaken (20261022190000_dose_reminder_repeats.sql).
export default async function ({ db, check, as }) {
  await db.exec(`
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    create table if not exists health_medicines (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid, name text, dose text, times text[], start_date date, end_date date, visibility text, created_by uuid);
    create table if not exists health_medicine_doses (medicine_id uuid, dose_date date, dose_time text);
  `);
  const med = (await db.query(
    "insert into health_medicines (family_id, member_id, name, dose, times, start_date, visibility, created_by) values ($1, $2, 'Losartan', '50mg', '{08:00}', '2026-10-01', 'family', $2) returning id",
    [A, ANN],
  )).rows[0].id;
  const kidMed = (await db.query(
    "insert into health_medicines (family_id, member_id, name, dose, times, start_date, visibility, created_by) values ($1, $2, 'Amoxicillin', '5ml', '{20:00}', '2026-10-01', 'family', $3) returning id",
    [A, KID, ANN],
  )).rows[0].id;
  // 08:00 Manila on 22 Oct is 00:00 UTC.
  const run = async (at, secret = SECRET) => (await db.query("select * from due_dose_repeats($1, $2)", [secret, at])).rows;
  const who = (rows) => [...new Set(rows.map((r) => r.endpoint.split("/").pop()))].sort().join("|");

  await check("Not before 5 minutes past: the first reminder is due_reminders' alone", async () => (await run("2026-10-22 00:04+00")).length === 0);
  await check("5 minutes past and untaken: again, to the person taking it", async () => {
    const rows = await run("2026-10-22 00:05+00");
    return (rows.length === 1 && who(rows) === "Ann A" && rows[0].title === "Still time for Ann's Losartan" && rows[0].key === `dose-again:${med}:2026-10-22:08:00:1`) || rows;
  });
  await check("Once per repeat: the next tick in the same five minutes sends nothing", async () => (await run("2026-10-22 00:09+00")).length === 0);
  await check("10 minutes past: the second repeat", async () => {
    const rows = await run("2026-10-22 00:10+00");
    return (rows.length === 1 && rows[0].key.endsWith(":2")) || rows;
  });
  await check("15 minutes past: no more (the missed-dose alert takes over)", async () => (await run("2026-10-22 00:15+00")).length === 0);
  await check("Ticked: nothing more is sent", async () => {
    await db.query("insert into health_medicine_doses (medicine_id, dose_date, dose_time) values ($1, '2026-10-23', '08:00')", [med]);
    return (await run("2026-10-23 00:05+00")).length === 0;
  });
  await check("A child's dose reaches the child and the household's grown-ups", async () => {
    const rows = await run("2026-10-22 12:05+00");
    return (who(rows) === "Ann A|Kid A" && rows.every((r) => r.key.startsWith(`dose-again:${kidMed}:`))) || rows;
  });
  await check("The Medicine switch off: nothing for that person", async () => {
    await db.query(`update members set notification_prefs = '{"health": false}' where id = $1`, [KID]);
    const rows = await run("2026-10-22 12:10+00");
    return who(rows) === "Ann A" || rows;
  });
  await check("Without the secret: nothing, and nothing written", async () => {
    const before = (await db.query("select count(*)::int n from reminder_sends")).rows[0].n;
    const rows = await run("2026-10-24 00:05+00", "wrong");
    const after = (await db.query("select count(*)::int n from reminder_sends")).rows[0].n;
    return (rows.length === 0 && before === after) || { rows, before, after };
  });
  await check("A signed-in member cannot get anything from it without the secret", async () =>
    (await as("10000000-0000-0000-0000-0000000000a1", "select * from due_dose_repeats('x', '2026-10-24 00:05+00')")).length === 0);
}
