const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000"; // stays on Manila
const D = "d0000000-0000-0000-0000-000000000000"; // moves to Los Angeles
// Reminders follow each household's own zone (20261007140000). The tables the
// due_*() functions read are stood in here with only the columns they use.
export default async function ({ db, check }) {
  await db.exec(`
    create table if not exists bills (id uuid primary key default gen_random_uuid(), family_id uuid not null, name text not null, amount numeric not null default 1, due_date date, status text not null default 'unpaid', paid_at timestamptz, recurrence text);
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    create table if not exists health_medicines (id uuid primary key default gen_random_uuid(), family_id uuid, member_id uuid, name text, dose text, times text[], start_date date, end_date date, visibility text, created_by uuid);
    create table if not exists health_medicine_doses (medicine_id uuid, dose_date date, dose_time text);
    create table if not exists events (id uuid primary key default gen_random_uuid(), family_id uuid, kind text, title text, event_date date, recurs_yearly boolean default false, applies_to_whole_family boolean default true);
    create table if not exists event_members (event_id uuid, member_id uuid);
    create table if not exists activities (id uuid primary key default gen_random_uuid(), family_id uuid, title text, start_at timestamptz, location text, status text default 'upcoming', applies_to_whole_family boolean default true);
    create table if not exists activity_members (activity_id uuid, member_id uuid);
    create table if not exists pantry_items (family_id uuid, name text, running_low boolean);
    create table if not exists buy_items (family_id uuid, name text, checked boolean default false, cleared boolean default false);
  `);
  await db.query("update families set time_zone = 'America/Los_Angeles' where id = $1", [D]);
  const run = async (fn, at) => (await db.query(`select * from ${fn}($1, $2)`, [SECRET, at])).rows;
  const who = (rows) => [...new Set(rows.map((r) => r.endpoint.split("/").pop()))].sort().join("|");

  // 7 Oct 00:30 UTC: 08:30 in Manila (before 09:00), 17:30 on 6 Oct in Los Angeles.
  await db.query("insert into bills (family_id, name, due_date) values ($1, 'Manila power', '2026-10-08'), ($2, 'LA power', '2026-10-07')", [A, D]);
  await check("A bill: Los Angeles is past 09:00 and hears of tomorrow's; Manila, at 08:30, hears nothing yet", async () => {
    const rows = await run("due_reminders", "2026-10-07 00:30+00");
    return (who(rows) === "Dan D" && rows.every((r) => r.title === "LA power is due tomorrow")) || rows.map((r) => r.title);
  });
  await check("At 10:00 Manila the Manila household gets its own", async () => {
    const rows = await run("due_reminders", "2026-10-07 02:00+00");
    return (who(rows) === "Ann A" && rows.every((r) => r.title === "Manila power is due tomorrow")) || rows.map((r) => r.title);
  });

  await db.query("insert into pantry_items values ($1, 'Rice', true), ($2, 'Eggs', true)", [A, D]);
  await check("Running low: from 09:00 in each household's own zone", async () => {
    const early = who(await run("due_pantry_reminders", "2026-10-07 00:30+00"));
    const later = who(await run("due_pantry_reminders", "2026-10-07 02:00+00"));
    return (early === "Dan D" && later === "Ann A") || [early, later];
  });

  // The week ahead: Sunday 11 Oct, 20:00 Manila is 12:00 UTC (05:00 in LA);
  // Sunday 20:00 in LA is 03:00 UTC on Monday 12 Oct (11:00 Monday in Manila).
  await db.query("insert into bills (family_id, name, due_date) values ($1, 'School fees', '2026-10-13'), ($2, 'Rent', '2026-10-13')", [A, D]);
  await check("The week ahead comes on each household's own Sunday evening", async () => {
    const manila = who(await run("due_week_ahead_reminders", "2026-10-11 12:00+00"));
    const la = who(await run("due_week_ahead_reminders", "2026-10-12 03:00+00"));
    return (manila === "Ann A" && la === "Dan D") || [manila, la];
  });

  await check("A zone name Postgres does not know falls back to Manila instead of stopping every reminder", async () => {
    await db.query("update families set time_zone = 'Mars/Olympus' where id = $1", [D]);
    const rows = await run("due_reminders", "2026-10-07 03:00+00");
    return Array.isArray(rows);
  });
  await check("The trial and goal-reward reminders run on the per-household clock too", async () => {
    await db.exec(`
      alter table families add column if not exists access_status text, add column if not exists access_expires_at timestamptz;
      alter table members add column if not exists is_organiser boolean default false;
      create table if not exists planner_goals (id uuid primary key default gen_random_uuid(), family_id uuid, title text, owner_member_id uuid);
      create table if not exists planner_goal_rewards (goal_id uuid, title text, status text, giver_member_id uuid, claimed_at timestamptz, given_at timestamptz, due_at timestamptz);
    `);
    await db.query("update families set time_zone = 'America/Los_Angeles', access_status = 'trialing', access_expires_at = '2026-10-08 12:00+00' where id = $1", [D]);
    await db.query("update members set is_organiser = true where full_name = 'Dan D'");
    const g = (await db.query("insert into planner_goals (family_id, title, owner_member_id) values ($1, 'Read 5 books', '00000000-0000-0000-0000-0000000000d2') returning id", [D])).rows[0].id;
    await db.query("insert into planner_goal_rewards values ($1, 'Pizza', 'claimed', '00000000-0000-0000-0000-0000000000d1', '2026-10-06 20:00+00', null, null)", [g]);
    // 7 Oct 05:00 UTC is 22:00 on 6 Oct in Los Angeles: quiet hours there.
    const quiet = (await run("due_trial_reminders", "2026-10-07 05:00+00")).length + (await run("due_goal_reward_reminders", "2026-10-07 05:00+00")).length;
    // 17:00 UTC is 10:00 in Los Angeles.
    const trial = who(await run("due_trial_reminders", "2026-10-07 17:00+00"));
    const goal = who(await run("due_goal_reward_reminders", "2026-10-07 17:00+00"));
    return (quiet === 0 && trial === "Dan D" && goal === "Dan D") || [quiet, trial, goal];
  });
  await check("The clock helper is not callable by a signed-in member", async () => {
    try {
      await db.exec("set role authenticated");
      await db.query("select * from household_clock(now())");
      return false;
    } catch {
      return true;
    } finally {
      await db.exec("reset role");
    }
  });
}
