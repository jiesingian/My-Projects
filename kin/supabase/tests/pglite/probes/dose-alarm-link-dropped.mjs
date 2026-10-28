// The "Kin Alarms" Shortcut link is gone (20261028150000): no table, no
// function anyone (the anonymous Shortcut above all) can call.
export default async function ({ db, check }) {
  await db.exec("reset role");
  await check("The link table is gone", async () => (await db.query("select to_regclass('public.dose_alarm_tokens') as t")).rows[0].t === null);
  await check("Its functions are gone", async () =>
    (await db.query("select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('set_dose_alarm_token','clear_dose_alarm_token','dose_alarm_link_state','dose_alarms_by_link','dose_alarm_token_follows_member')")).rows[0].n === 0);
  await check("Members update without the old trigger", async () =>
    (await db.query("select count(*)::int as n from pg_trigger where tgname = 'dose_alarm_token_follows_member'")).rows[0].n === 0);
}
