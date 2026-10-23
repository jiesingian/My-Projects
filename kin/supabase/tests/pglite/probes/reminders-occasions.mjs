const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
// The morning occasion push (20261023230000): anniversaries go out like
// birthdays, and a 29 February birthday is heard of on 1 March in a year
// without one -- the day Today and the Planner give it. The tables
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
  // Only the occasion rows: a morning run finds nothing else due here.
  const occasions = async (at) => (await db.query("select * from due_reminders($1, $2)", [SECRET, at])).rows.filter((r) => r.key.startsWith("bday:") || r.key.startsWith("anniv:"));
  const said = (rows) => [...new Set(rows.map((r) => `${r.title} · ${r.body}`))].sort().join("|");

  await db.query(
    `insert into events (family_id, kind, title, event_date, recurs_yearly) values
       ($1, 'birthday', 'Lola Rosa', '1954-10-24', true),
       ($1, 'anniversary', 'Marco & Tess', '2011-10-24', true),
       ($1, 'anniversary', 'Housewarming', '2026-10-24', false),
       ($1, 'birthday', 'Leap Lia', '2016-02-29', true)`,
    [A],
  );

  // 24 Oct 2026, 09:00 Manila is 01:00 UTC.
  await check("A birthday and an anniversary push the same morning, the anniversary counting its years", async () => {
    const got = said(await occasions("2026-10-24 01:00+00"));
    const want = ["Housewarming · Today. Say happy anniversary!", "Lola Rosa · Today. Say happy birthday!", "Marco & Tess · 15 years today. Say happy anniversary!"].join("|");
    return got === want || got;
  });
  await check("Not before 08:00 in the household's zone, and not twice", async () => {
    await db.query("delete from reminder_sends");
    // One row per device, so count the pushes by their keys.
    const keys = async (at) => new Set((await occasions(at)).map((r) => r.key)).size;
    const early = await keys("2026-10-23 23:30+00"); // 07:30 Manila
    const first = await keys("2026-10-24 01:00+00");
    const again = await keys("2026-10-24 01:10+00");
    return (early === 0 && first === 3 && again === 0) || [early, first, again];
  });
  await check("A 29 February birthday: nothing on 28 February 2027, pushed on 1 March", async () => {
    const feb28 = said(await occasions("2027-02-28 01:00+00"));
    const mar1 = said(await occasions("2027-03-01 01:00+00"));
    return (feb28 === "" && mar1 === "Leap Lia · Today. Say happy birthday!") || [feb28, mar1];
  });
  await check("In a leap year it is pushed on the 29th and not again on 1 March", async () => {
    const feb29 = said(await occasions("2028-02-29 01:00+00"));
    const mar1 = said(await occasions("2028-03-01 01:00+00"));
    return (feb29 === "Leap Lia · Today. Say happy birthday!" && mar1 === "") || [feb29, mar1];
  });
}
