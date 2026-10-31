const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
// Quarterly and semi-annual Planner tasks (20261031120000): the rule helper
// falls every 3 and 6 months on the first day's date, and the 30-minute push
// follows it rather than treating the task as a one-off. Stand-in tables as
// in reminders-repeating-tasks.
export default async function ({ db, check }) {
  await db.exec(`
    create table if not exists bills (id uuid primary key default gen_random_uuid(), family_id uuid not null, name text not null, amount numeric not null default 1, due_date date, status text not null default 'unpaid', paid_at timestamptz, recurrence text);
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    create table if not exists health_medicines (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid, name text, dose text, times text[], start_date date, end_date date, visibility text, created_by uuid);
    create table if not exists health_medicine_doses (medicine_id uuid, dose_date date, dose_time text);
    create table if not exists events (id uuid primary key default gen_random_uuid(), family_id uuid, kind text, title text, event_date date, recurs_yearly boolean default false, applies_to_whole_family boolean default true);
    create table if not exists event_members (event_id uuid, member_id uuid);
    create table if not exists activity_members (activity_id uuid, member_id uuid);
    create table if not exists today_marks (family_id uuid, item_key text, day date, state text);
    alter table activities add column if not exists repeat text not null default 'once',
      add column if not exists repeat_days smallint[], add column if not exists repeat_until date;
  `);
  const occurs = async (repeat, first, day, until = null) =>
    (await db.query("select activity_occurs_on($1, null, $4, $2::date, $3::date) as on", [repeat, first, day, until])).rows[0].on;
  const soon = async (at) => (await db.query("select * from due_reminders($1, $2)", [SECRET, at])).rows.filter((r) => r.key.startsWith("soon:"));
  const titles = (rows) => [...new Set(rows.map((r) => r.title))].sort().join("|");

  await check("Quarterly falls every 3 months on the date, and not between", async () => {
    const got = [
      await occurs("quarterly", "2026-01-15", "2026-04-15"),
      await occurs("quarterly", "2026-01-15", "2027-01-15"),
      await occurs("quarterly", "2026-01-15", "2026-02-15"),
      await occurs("quarterly", "2026-01-15", "2026-04-16"),
    ];
    return JSON.stringify(got) === "[true,true,false,false]" || got;
  });
  await check("Semi-annually falls every 6 months, and stops at its end", async () => {
    const got = [
      await occurs("semiannually", "2026-03-10", "2026-09-10"),
      await occurs("semiannually", "2026-03-10", "2026-06-10"),
      await occurs("semiannually", "2026-03-10", "2027-03-10", "2026-12-31"),
    ];
    return JSON.stringify(got) === "[true,false,false]" || got;
  });

  // Review: 15 Jan 2026, 10:00 Manila (02:00 UTC), quarterly.
  await db.query("insert into activities (family_id, title, start_at, repeat) values ($1, 'Review', '2026-01-15 02:00+00', 'quarterly')", [A]);
  await check("A quarterly task is pushed 30 minutes before on a later quarter (15 Oct)", async () => {
    const rows = await soon("2026-10-15 01:35+00");
    return titles(rows) === "In 30 minutes: Review" || titles(rows);
  });
  await check("Not in a month between quarters (15 Nov)", async () => (await soon("2026-11-15 01:35+00")).length === 0);
}
