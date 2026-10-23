const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
// Two pushes that said the wrong thing (20261023235000): a bill paid elsewhere
// and waiting on confirmation is not "due today, tap to pay", and an all-day
// plan at the household's midnight gets no 35-minute heads-up. The tables
// due_reminders reads are stood in with only the columns they use.
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
  const rows = async (at, prefix) => (await db.query("select * from due_reminders($1, $2)", [SECRET, at])).rows.filter((r) => r.key.startsWith(prefix));
  const titles = (list) => [...new Set(list.map((r) => r.title))].sort().join("|");

  // Monday 26 Oct 2026: one bill unpaid, one paid in another app ("scheduled").
  await db.query("insert into bills (family_id, name, due_date, status) values ($1, 'Meralco', '2026-10-26', 'unpaid'), ($1, 'PLDT', '2026-10-26', 'scheduled')", [A]);
  await check("A bill paid elsewhere and waiting on confirmation is not pushed as due; the unpaid one is", async () => {
    const got = titles(await rows("2026-10-26 01:30+00", "bill:")); // 09:30 Manila
    return got === "Meralco is due today" || got;
  });

  // An all-day plan at Manila midnight on 27 Oct (16:00 UTC on the 26th), and
  // a 07:00 plan on the 27th (23:00 UTC on the 26th).
  await db.query(
    "insert into activities (family_id, title, start_at) values ($1, 'Undas holiday', '2026-10-26 16:00+00'), ($1, 'Early practice', '2026-10-26 23:00+00')",
    [A],
  );
  await check("No heads-up at 23:30 for the all-day plan; the 07:00 one gets its 30-minute push", async () => {
    const night = titles(await rows("2026-10-26 15:35+00", "soon:"));
    const morning = titles(await rows("2026-10-26 22:35+00", "soon:"));
    return (night === "" && morning === "In 30 minutes: Early practice") || [night, morning];
  });
  await check("A weekly plan at midnight gets no heads-up either", async () => {
    await db.query("insert into activities (family_id, title, start_at, repeat, repeat_days) values ($1, 'Market day', '2026-10-19 16:00+00', 'weekly', '{1}')", [A]);
    // Mondays at 00:00 Manila; Monday 2 Nov begins at 16:00 UTC on 1 Nov.
    const got = titles(await rows("2026-11-01 15:35+00", "soon:"));
    return got === "" || got;
  });
}
