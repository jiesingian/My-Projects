const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
const D = "d0000000-0000-0000-0000-000000000000"; // set to Los Angeles here
const DAN_M = "00000000-0000-0000-0000-0000000000d1";
// due_reminders (20261020090300): a plan ticked Done on Today is not
// reminded; a refill key outlives the 40-day purge; a dose due in a
// spring-forward gap is still pushed.
export default async function ({ db, check }) {
  await db.exec(`
    create table if not exists bills (id uuid primary key default gen_random_uuid(), family_id uuid not null, name text not null, amount numeric not null default 1, due_date date, status text not null default 'unpaid', paid_at timestamptz, recurrence text);
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    create table if not exists health_medicines (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid, name text, dose text, times text[], start_date date, end_date date, visibility text, created_by uuid);
    create table if not exists health_medicine_doses (medicine_id uuid, dose_date date, dose_time text);
    create table if not exists events (id uuid primary key default gen_random_uuid(), family_id uuid, kind text, title text, event_date date, recurs_yearly boolean default false, applies_to_whole_family boolean default true);
    create table if not exists activity_members (activity_id uuid, member_id uuid);
    create table if not exists today_marks (family_id uuid, item_key text, day date, state text);
    alter table activities add column if not exists repeat text not null default 'once',
      add column if not exists repeat_days smallint[], add column if not exists repeat_until date;
  `);
  const due = async (at) => (await db.query("select * from due_reminders($1, $2)", [SECRET, at])).rows;

  await check("A one-off plan ticked Done on Today is not reminded; one not ticked is", async () => {
    await db.query(
      "insert into activities (family_id, title, start_at, status) values ($1, 'Lunch with Tita', '2026-11-03 04:00+00', 'completed'), ($1, 'Haircut', '2026-11-03 04:00+00', 'upcoming')",
      [A],
    );
    const t = [...new Set((await due("2026-11-03 03:35+00")).filter((r) => r.key.startsWith("soon:")).map((r) => r.title))].sort();
    return JSON.stringify(t) === JSON.stringify(["In 30 minutes: Haircut"]) || t;
  });

  await check("The 40-day purge keeps refill keys and clears the rest", async () => {
    await db.query("insert into reminder_sends (key, sent_at) values ('refill:m:2026-09-01', now() - interval '50 days'), ('bill:x:old', now() - interval '50 days')");
    await due(new Date().toISOString());
    const keys = (await db.query("select key from reminder_sends where key in ('refill:m:2026-09-01', 'bill:x:old')")).rows.map((r) => r.key);
    return JSON.stringify(keys) === JSON.stringify(["refill:m:2026-09-01"]) || keys;
  });

  const old = (await db.query("select time_zone from families where id = $1", [D])).rows[0]?.time_zone ?? null;
  try {
    await db.query("update families set time_zone = 'America/Los_Angeles' where id = $1", [D]);
    const med = (await db.query(
      "insert into health_medicines (family_id, member_id, name, times, start_date, visibility, created_by) values ($1, $2, 'Night pill', '{02:30,08:00}', '2027-03-01', 'family', $2) returning id",
      [D, DAN_M],
    )).rows[0].id;
    await check("Los Angeles, 14 Mar 2027: the 02:30 dose the clocks skip is still pushed", async () => {
      // 02:30 has no wall-clock time that day; read as standard time it is
      // 10:30 UTC (03:30 PDT). (Not sent twice is the key's job, unchanged;
      // it can't be shown here: sent_at is the real clock, so the purge
      // measured from a 2027 p_now clears it.)
      const rows = (await due("2027-03-14 10:35+00")).filter((r) => r.key === `dose:${med}:2027-03-14:02:30`);
      return rows.length === 1 || rows;
    });
    await check("An ordinary day's dose still comes at its time, not before", async () => {
      const early = (await due("2027-03-15 14:55+00")).filter((r) => r.key === `dose:${med}:2027-03-15:08:00`).length;
      const onTime = (await due("2027-03-15 15:02+00")).filter((r) => r.key === `dose:${med}:2027-03-15:08:00`).length;
      return (early === 0 && onTime === 1) || [early, onTime];
    });
  } finally {
    await db.query("update families set time_zone = $2 where id = $1", [D, old]);
  }
}
