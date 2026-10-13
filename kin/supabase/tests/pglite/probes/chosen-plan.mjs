// families.chosen_plan (20261013150000): the plan chosen on the public plan
// step, saved by create_family, readable like the rest of the family row, not
// changeable afterwards, and only changing the trial reminders' wording.
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // organiser of A
const KID = "10000000-0000-0000-0000-0000000000a2"; // a child in A
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const NEW1 = "10000000-0000-0000-0000-0000000000e1"; // signed up, no household yet
const NEW2 = "10000000-0000-0000-0000-0000000000e2";
const NEW3 = "10000000-0000-0000-0000-0000000000e3";
const NEW4 = "10000000-0000-0000-0000-0000000000e4";

export default async function ({ db, as, check, refused }) {
  // The live columns and helpers create_family uses, stood in.
  await db.exec(`
    alter table members add column if not exists dob date, add column if not exists mobile text, add column if not exists is_organiser boolean not null default false;
    alter table families add column if not exists access_status text, add column if not exists access_expires_at timestamptz;
    create or replace function public.generate_invite_code() returns text language sql as $$ select upper(substr(md5(random()::text), 1, 6)) $$;
    create policy families_update on families for update using (id = current_family_id() and exists (select 1 from members m where m.auth_user_id = auth.uid() and m.is_organiser and m.family_id = families.id));
    grant update on families to authenticated;
    create table if not exists reminder_sends (key text primary key, sent_at timestamptz not null default now());
    update members set is_organiser = true where full_name in ('Ann A', 'Ben B', 'Cat C');
  `);
  const planOf = async (who) => (await as(who, "select f.chosen_plan from families f join members m on m.family_id = f.id where m.auth_user_id = auth.uid()"))[0]?.chosen_plan;

  await check("Starting with Plus is saved on the new household", async () => {
    await as(NEW1, "select create_family('The Cruz Family', 'Ana Cruz', null, null, 'plus')");
    return (await planOf(NEW1)) === "plus" || (await planOf(NEW1));
  });
  await check("Just Kin Free is saved too", async () => {
    await as(NEW2, "select create_family(p_household_name => 'The Lim Family', p_full_name => 'Lia Lim', p_chosen_plan => 'free')");
    return (await planOf(NEW2)) === "free" || (await planOf(NEW2));
  });
  await check("No plan (skipped the check-up) is null, and naming only two arguments is not ambiguous", async () => {
    await as(NEW3, "select create_family(p_household_name => 'The Go Family', p_full_name => 'Gil Go')");
    return (await planOf(NEW3)) === null || (await planOf(NEW3));
  });
  await check("Anything else is stored as null rather than refusing the family", async () => {
    await as(NEW4, "select create_family('The Uy Family', 'Una Uy', null, null, 'gold')");
    return (await planOf(NEW4)) === null || (await planOf(NEW4));
  });
  await check("The old four-argument create_family is gone", async () => {
    const rows = await db.query("select count(*)::int n from pg_proc where proname = 'create_family'");
    return rows.rows[0].n === 1 || rows.rows[0].n;
  });

  await check("Someone already in a household cannot create another to pick a plan", async () =>
    refused(() => as(ANN, "select create_family('Second', 'Ann A', null, null, 'plus')"), "already a member"),
  );
  await check("Not callable signed out", async () =>
    refused(async () => {
      await db.exec("set role anon");
      try {
        await db.query("select create_family('X', 'Y', null, null, 'plus')");
      } finally {
        await db.exec("reset role");
      }
    }),
  );

  await db.query("select set_config('kin.privileged', 'on', false)");
  await db.query("update families set chosen_plan = 'plus' where id = $1", [A]);
  await db.query("update families set chosen_plan = 'free' where id = $1", [B]);
  await db.query("select set_config('kin.privileged', 'off', false)");

  await check("Every member reads their own household's plan, a child included", async () => {
    const ann = await planOf(ANN);
    const kid = await planOf(KID);
    return (ann === "plus" && kid === "plus") || [ann, kid];
  });
  await check("Another household's plan is not readable", async () => {
    const rows = await as(DAN, "select chosen_plan from families where id = $1", [A]);
    return rows.length === 0 || rows;
  });
  await check("The organiser can still rename the household", async () => {
    await as(ANN, "update families set name = 'House A renamed' where id = $1", [A]);
    return (await db.query("select name from families where id = $1", [A])).rows[0].name === "House A renamed";
  });
  await check("But cannot change the plan chosen at the start", async () =>
    refused(() => as(ANN, "update families set chosen_plan = 'free' where id = $1", [A]), "chosen plan"),
  );
  await check("Nor clear it", async () => refused(() => as(ANN, "update families set chosen_plan = null where id = $1", [A]), "chosen plan"));
  await check("A stranger's update reaches nothing", async () => {
    await as(DAN, "update families set chosen_plan = 'free' where id = $1", [A]);
    return (await db.query("select chosen_plan from families where id = $1", [A])).rows[0].chosen_plan === "plus";
  });
  await check("The column takes only plus, free or null", async () =>
    refused(async () => {
      await db.query("select set_config('kin.privileged', 'on', false)");
      try {
        await db.query("update families set chosen_plan = 'gold' where id = $1", [C]);
      } finally {
        await db.query("select set_config('kin.privileged', 'off', false)");
      }
    }, "families_chosen_plan_check"),
  );

  await check("The last-day reminder is worded for the plan chosen; no plan keeps today's words", async () => {
    // 7 Oct 02:00 UTC is 10:00 in Manila; each trial ends in twelve hours.
    await db.query("update families set access_status = 'trialing', access_expires_at = '2026-10-07 14:00+00' where id = any($1)", [[A, B, C]]);
    const rows = (await db.query("select * from due_trial_reminders($1, $2)", [SECRET, "2026-10-07 02:00+00"])).rows;
    const byWho = Object.fromEntries(rows.map((r) => [r.endpoint.split("/").pop(), r]));
    const plus = byWho["Ann A"];
    const free = byWho["Ben B"];
    const none = byWho["Cat C"];
    const ok =
      plus?.title === "Last day of your Kin Plus trial" && /subscribe today/.test(plus.body) && /No automatic payment/.test(plus.body) &&
      free?.title === "Tomorrow you're on Kin Free" && !/₱/.test(free.body) &&
      none?.title === "Last day of your Kin Plus trial" && none.body === "Tomorrow House C moves to Kin Free. Nothing you added is lost. Plus is ₱149 a month for the whole family.";
    return ok || rows.map((r) => [r.endpoint, r.title, r.body]);
  });
}
