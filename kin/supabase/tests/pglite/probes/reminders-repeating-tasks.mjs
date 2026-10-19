const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // Manila
// The reminder pushes follow repeating tasks (20261019090001): chosen
// weekdays, the end date, a day already ticked on Today, and rows saved
// before there were days. The tables the due_*() functions read are stood in
// with only the columns they use. 12 Oct 2026 is a Monday.
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
  const soon = async (at) => (await db.query("select * from due_reminders($1, $2)", [SECRET, at])).rows.filter((r) => r.key.startsWith("soon:"));
  const titles = (rows) => [...new Set(rows.map((r) => r.title))].sort().join("|");

  // Gym: Mon and Wed at 07:00 Manila (23:00 UTC the day before), until Wed 21 Oct.
  await db.query(
    "insert into activities (family_id, title, start_at, repeat, repeat_days, repeat_until) values ($1, 'Gym', '2026-10-11 23:00+00', 'weekly', '{1,3}', '2026-10-21')",
    [A],
  );

  await check("On a chosen day (Wed 14 Oct) the 30-minute push comes at its usual time", async () => {
    const rows = await soon("2026-10-13 22:35+00");
    return titles(rows) === "In 30 minutes: Gym" || titles(rows);
  });
  await check("Not twice for the same day", async () => (await soon("2026-10-13 22:40+00")).length === 0);
  await check("Not on a day it does not fall (Tue 13 Oct)", async () => (await soon("2026-10-12 22:35+00")).length === 0);
  await check("Not on a day already ticked on Today (Mon 19 Oct)", async () => {
    await db.query("insert into today_marks values ($1, (select 'activity-' || id from activities where title = 'Gym'), '2026-10-19', 'done')", [A]);
    return (await soon("2026-10-18 22:35+00")).length === 0;
  });
  await check("On its end day, and not after it", async () => {
    const last = titles(await soon("2026-10-20 22:35+00"));
    const after = (await soon("2026-10-25 22:35+00")).length;
    return (last === "In 30 minutes: Gym" && after === 0) || [last, after];
  });

  await check("A weekly row saved before there were days keeps its own weekday", async () => {
    // Thu 15 Oct 18:00 Manila; the next Thursday at 17:35 is 09:35 UTC.
    await db.query("insert into activities (family_id, title, start_at, repeat) values ($1, 'Choir', '2026-10-15 10:00+00', 'weekly')", [A]);
    const thu = titles(await soon("2026-10-22 09:35+00"));
    const fri = (await soon("2026-10-23 09:35+00")).length;
    return (thu === "In 30 minutes: Choir" && fri === 0) || [thu, fri];
  });
  await check("A one-off plan is reminded as before", async () => {
    await db.query("insert into activities (family_id, title, start_at) values ($1, 'Dentist', '2026-10-27 02:00+00')", [A]);
    return titles(await soon("2026-10-27 01:35+00")) === "In 30 minutes: Dentist";
  });

  await check("The week ahead says a repeating plan once, with its days", async () => {
    // Sunday 11 Oct, 20:00 Manila: the week of Mon 12 to Sun 18 Oct.
    const rows = (await db.query("select * from due_week_ahead_reminders($1, $2)", [SECRET, "2026-10-11 12:00+00"])).rows;
    const body = rows.find((r) => r.endpoint.endsWith("Ann A"))?.body ?? "";
    return (body.includes("Gym Mon/Wed") && (body.match(/Gym/g) ?? []).length === 1 && body.includes("Choir Thu")) || body;
  });

  await check("The rule helper is not callable by a signed-in member", async () => {
    try {
      await db.exec("set role authenticated");
      await db.query("select activity_occurs_on('weekly', null, null, current_date, current_date)");
      return false;
    } catch {
      return true;
    } finally {
      await db.exec("reset role");
    }
  });
}
