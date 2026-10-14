// Tell someone when a dose is missed (20261014200000): only a grown-up of the
// household sets it, only a grown-up of the same household with a login is
// told, never about a medicine they couldn't see, never before it was turned
// on, once per dose, in the household's own clock, and only on Kin Plus.
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const BEN = "10000000-0000-0000-0000-0000000000b1"; // parent in B, linked to A
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const KID_M = "00000000-0000-0000-0000-0000000000a2";
const BEN_M = "00000000-0000-0000-0000-0000000000b1";
const LOLA_M = "00000000-0000-0000-0000-0000000000f4"; // takes the medicine
const TITA_M = "00000000-0000-0000-0000-0000000000f5"; // grown-up with a login
const TITO_M = "00000000-0000-0000-0000-0000000000f6"; // grown-up, no login
const TITA = "10000000-0000-0000-0000-0000000000f5";

const ABE = "10000000-0000-0000-0000-0000000000a4"; // adult in A, own login
const ABE_M = "00000000-0000-0000-0000-0000000000a4";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  // The medicines' own visibility (20260926110000), in place of base.sql's
  // household-wide stand-in, so "could see it anyway" is really tested.
  await db.exec(`
    drop policy if exists hm_all on health_medicines;
    create policy hm_select on health_medicines for select using (
      family_id = current_family_id()
      and (visibility = 'family' or member_id = current_member_id() or created_by = current_member_id()
           or (visibility = 'parents' and current_member_role() = 'parent')));
    insert into members (id, family_id, auth_user_id, full_name, role, sex) values
      ('${LOLA_M}', '${A}', null, 'Lola Reyes', 'adult', 'female'),
      ('${TITA_M}', '${A}', '${TITA}', 'Tita Reyes', 'adult', null),
      ('${TITO_M}', '${A}', null, 'Tito Reyes', 'adult', null);
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values ('${TITA_M}', '${A}', 'https://push/Tita', 'k', 'a');
    insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility, created_by) values
      ('e1000000-0000-0000-0000-000000000001', '${A}', '${LOLA_M}', 'Losartan', '{08:00,23:30}', '2026-10-01', 'family', '${ANN_M}'),
      ('e1000000-0000-0000-0000-000000000002', '${A}', '${LOLA_M}', 'Metformin', '{08:00}', '2026-10-01', 'parents', '${ANN_M}'),
      ('e1000000-0000-0000-0000-000000000003', '${A}', '${LOLA_M}', 'Sertraline', '{08:00}', '2026-10-01', 'private', '${ANN_M}');
  `);
  const SERTRALINE = "e1000000-0000-0000-0000-000000000003";
  const LOSARTAN = "e1000000-0000-0000-0000-000000000001";
  const METFORMIN = "e1000000-0000-0000-0000-000000000002";
  const set = (who, medicine, receiver, setBy, extra = "") =>
    as(who, `insert into health_medicine_alerts (medicine_id, family_id, notify_member_id, delay_minutes, set_by${extra ? ", active_since" : ""}) values ($1, $2, $3, 60, $4${extra ? `, '${extra}'` : ""}) returning active_since`, [medicine, A, receiver, setBy]);

  await check("A grown-up turns it on for another grown-up with a login, and the start is the server's, not a forged earlier one", async () => {
    const rows = await set(ANN, LOSARTAN, TITA_M, ANN_M, "2026-01-01 00:00+00");
    return new Date(rows[0].active_since) > new Date("2026-06-01") || rows;
  });
  await check("The household can read it; the person told can too", async () => {
    const ann = await as(ANN, "select notify_member_id from health_medicine_alerts");
    const tita = await as(TITA, "select notify_member_id from health_medicine_alerts");
    return (ann.length === 1 && tita.length === 1) || [ann, tita];
  });
  await check("Another household cannot read it", async () => {
    const ben = await as(BEN, "select * from health_medicine_alerts");
    const dan = await as(DAN, "select * from health_medicine_alerts");
    return (ben.length === 0 && dan.length === 0) || [ben, dan];
  });
  await check("Another household cannot set one on this household's medicine", async () => {
    await db.exec(`delete from health_medicine_alerts`);
    return await refused(() => as(DAN, "insert into health_medicine_alerts (medicine_id, family_id, notify_member_id, set_by) values ($1, $2, $3, '00000000-0000-0000-0000-0000000000d1')", [LOSARTAN, A, TITA_M]));
  });
  await check("A child cannot set one, even with a login of their own", async () => refused(() => set(KID, LOSARTAN, TITA_M, KID_M)));
  await check("A forged author is refused", async () => refused(() => set(ANN, LOSARTAN, TITA_M, TITA_M)));
  await check("A child cannot be the one told", async () => refused(() => set(ANN, LOSARTAN, KID_M, ANN_M)));
  await check("A grown-up without a login cannot be told (no phone to reach)", async () => refused(() => set(ANN, LOSARTAN, TITO_M, ANN_M)));
  await check("Somebody in another household cannot be told", async () => refused(() => set(ANN, LOSARTAN, BEN_M, ANN_M)));
  await check("The person taking it cannot be the one told", async () => refused(() => set(ANN, LOSARTAN, LOLA_M, ANN_M)));
  await check("A parents-only medicine cannot be reported to a grown-up who is not a parent", async () => refused(() => set(ANN, METFORMIN, TITA_M, ANN_M)));

  await check("A grown-up who cannot see a private medicine cannot set one on it", async () =>
    refused(() => as(ABE, "insert into health_medicine_alerts (medicine_id, family_id, notify_member_id, set_by) values ($1, $2, $3, $4)", [SERTRALINE, A, TITA_M, ABE_M])));
  await check("A private medicine cannot be reported to a grown-up it is hidden from", async () => refused(() => set(ANN, SERTRALINE, ABE_M, ANN_M)));
  await check("A forged household is refused", async () =>
    refused(() => as(ANN, "insert into health_medicine_alerts (medicine_id, family_id, notify_member_id, set_by) values ($1, $2, $3, $4)", [LOSARTAN, D, TITA_M, ANN_M])));
  await check("A removed member cannot be told", async () => {
    await db.query("update members set status = 'removed' where id = $1", [ABE_M]);
    const r = await refused(() => set(ANN, LOSARTAN, ABE_M, ANN_M));
    await db.query("update members set status = 'active' where id = $1", [ABE_M]);
    return r;
  });
  await check("A removed grown-up can no longer set one", async () => {
    await db.query("update members set status = 'removed' where id = $1", [ANN_M]);
    const r = await refused(() => set(ANN, LOSARTAN, TITA_M, ANN_M));
    await db.query("update members set status = 'active' where id = $1", [ANN_M]);
    return r;
  });
  await check("The receiver check is closed to someone signed out", async () =>
    refused(async () => {
      await db.exec("set role anon");
      try {
        await db.query("select medicine_alert_receiver_ok($1, $2)", [LOSARTAN, TITA_M]);
      } finally {
        await db.exec("reset role");
      }
    }));

  await set(ANN, LOSARTAN, TITA_M, ANN_M);
  await check("A grown-up of another household cannot take it over as the one told", async () => {
    await as(DAN, "update health_medicine_alerts set notify_member_id = $1, set_by = $1", ["00000000-0000-0000-0000-0000000000d1"]);
    const r = (await db.query("select notify_member_id from health_medicine_alerts")).rows;
    return (r.length === 1 && r[0].notify_member_id === TITA_M) || r;
  });
  await check("An alert cannot be moved to another medicine", async () =>
    refused(() => as(ANN, "update health_medicine_alerts set medicine_id = $1, set_by = $2", [METFORMIN, ANN_M])));
  await check("A child cannot change or turn off one that is on", async () => {
    await as(KID, "update health_medicine_alerts set delay_minutes = 120, set_by = $1", [KID_M]);
    await as(KID, "delete from health_medicine_alerts");
    const rows = await db.query("select delay_minutes from health_medicine_alerts");
    return (rows.rows.length === 1 && rows.rows[0].delay_minutes === 60) || rows.rows;
  });
  await check("Another household cannot change or turn it off", async () => {
    await as(DAN, "update health_medicine_alerts set delay_minutes = 120");
    await as(DAN, "delete from health_medicine_alerts");
    const rows = await db.query("select delay_minutes from health_medicine_alerts");
    return (rows.rows.length === 1 && rows.rows[0].delay_minutes === 60) || rows.rows;
  });
  await check("Changing it to a child is refused", async () => refused(() => as(ANN, "update health_medicine_alerts set notify_member_id = $1, set_by = $2", [KID_M, ANN_M])));
  await check("A grown-up changes the delay, and the start stays where it was", async () => {
    const before = (await db.query("select active_since from health_medicine_alerts")).rows[0].active_since;
    await as(ANN, "update health_medicine_alerts set delay_minutes = 30, set_by = $1, active_since = '2020-01-01'", [ANN_M]);
    const after = (await db.query("select active_since, delay_minutes from health_medicine_alerts")).rows[0];
    return (after.delay_minutes === 30 && +after.active_since === +before) || after;
  });
  await check("Only the three delays are allowed", async () => refused(() => as(ANN, "update health_medicine_alerts set delay_minutes = 5, set_by = $1", [ANN_M])));

  // The job. Started on 13 October in Manila, an hour's delay.
  await db.exec(`
    alter table health_medicine_alerts disable trigger health_medicine_alerts_stamp;
    update health_medicine_alerts set delay_minutes = 60, active_since = '2026-10-13 00:00+08';
    alter table health_medicine_alerts enable trigger health_medicine_alerts_stamp;
  `);
  const run = async (at, secret = SECRET) => (await db.query("select * from due_missed_dose_alerts($1, $2)", [secret, at])).rows;

  await check("Without the secret nothing is said", async () => (await run("2026-10-14 01:00+00", "wrong")).length === 0);
  await check("Not before the dose time plus the delay (08:55 Manila for an 08:00 dose)", async () => (await run("2026-10-14 00:55+00")).length === 0);
  await check("At 09:00 Manila the person told gets one push, in plain words, opening Lola's medicines", async () => {
    const rows = await run("2026-10-14 01:00+00");
    return (
      (rows.length === 1 &&
        rows[0].member_id === TITA_M &&
        rows[0].title === "Lola hasn't taken her 8:00 AM Losartan" &&
        rows[0].url === `/family/members/${LOLA_M}?view=health&seg=medicines`) ||
      rows
    );
  });
  await check("The ledger stops a second push for the same dose", async () => (await run("2026-10-14 01:05+00")).length === 0);
  await check("A dose ticked Taken is not reported", async () => {
    await db.query("insert into health_medicine_doses (family_id, medicine_id, dose_date, dose_time) values ($1, $2, '2026-10-15', '08:00')", [A, LOSARTAN]);
    return (await run("2026-10-15 01:00+00")).length === 0;
  });
  await check("Around midnight: a 23:30 dose an hour late is reported at 00:30 the next day, as the day it was due", async () => {
    const rows = await run("2026-10-14 16:30+00");
    return (rows.length === 1 && rows[0].key === `missed:${LOSARTAN}:2026-10-14:23:30`) || rows;
  });
  await check("Doses before it was turned on are never reported", async () => {
    await db.exec(`
      alter table health_medicine_alerts disable trigger health_medicine_alerts_stamp;
      update health_medicine_alerts set active_since = '2026-10-16 08:30+08';
      alter table health_medicine_alerts enable trigger health_medicine_alerts_stamp;
    `);
    return (await run("2026-10-16 01:00+00")).length === 0;
  });
  await check("The household's own zone: in Los Angeles an 08:00 dose is reported at 09:00 there", async () => {
    await db.query("update families set time_zone = 'America/Los_Angeles' where id = $1", [A]);
    // 17 Oct 09:00 in Los Angeles (PDT, UTC-7) is 16:00 UTC; 01:00 UTC is 18:00 the day before.
    const manilaHour = await run("2026-10-17 01:00+00");
    const laHour = await run("2026-10-17 16:00+00");
    await db.query("update families set time_zone = 'Asia/Manila' where id = $1", [A]);
    return (manilaHour.length === 0 && laHour.length === 1 && laHour[0].key.endsWith(":2026-10-17:08:00")) || [manilaHour, laHour];
  });
  await check("The Health switch turned off: nothing reaches the person told", async () => {
    await db.query("update members set notification_prefs = '{\"health\": false}' where id = $1", [TITA_M]);
    const rows = await run("2026-10-18 01:00+00");
    await db.query("update members set notification_prefs = '{}' where id = $1", [TITA_M]);
    return rows.length === 0 || rows;
  });
  await check("Someone who stopped being a grown-up with a login is no longer told", async () => {
    await db.query("update members set auth_user_id = null where id = $1", [TITA_M]);
    const rows = await run("2026-10-19 01:00+00");
    await db.query("update members set auth_user_id = $2 where id = $1", [TITA_M, TITA]);
    return rows.length === 0 || rows;
  });

  await check("A medicine made parents-only after the alert was set: a grown-up who isn't a parent is no longer told", async () => {
    await db.query("update health_medicines set visibility = 'parents' where id = $1", [LOSARTAN]);
    const rows = await run("2026-10-20 01:00+00");
    await db.query("update health_medicines set visibility = 'family' where id = $1", [LOSARTAN]);
    return rows.length === 0 || rows;
  });
  await check("Someone removed from the household is no longer told", async () => {
    await db.query("update members set status = 'removed' where id = $1", [TITA_M]);
    const rows = await run("2026-10-21 01:00+00");
    await db.query("update members set status = 'active' where id = $1", [TITA_M]);
    return rows.length === 0 || rows;
  });
  await check("And the next dose, with nothing changed, is reported again (so the two above were real refusals)", async () => {
    const rows = await run("2026-10-22 01:00+00");
    return (rows.length === 1 && rows[0].member_id === TITA_M) || rows;
  });

  await check("On Kin Free an alert already on can still be changed and turned off", async () => {
    await db.exec(`
      create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select false $$;
      create or replace function public.require_kin_plus() returns trigger language plpgsql security definer set search_path = public as $$
      begin
        if auth.uid() is not null and not public.family_has_plus(new.family_id) then
          raise exception 'kin_plus_required: % is part of Kin Plus', tg_argv[0];
        end if;
        return new;
      end $$;
    `);
    await as(ANN, "update health_medicine_alerts set delay_minutes = 120, set_by = $1", [ANN_M]);
    const changed = (await db.query("select delay_minutes from health_medicine_alerts")).rows;
    await as(ANN, "delete from health_medicine_alerts");
    const gone = (await db.query("select 1 from health_medicine_alerts")).rows;
    return (changed.length === 1 && changed[0].delay_minutes === 120 && gone.length === 0) || [changed, gone];
  });
  await check("On Kin Free a new one is refused", async () => {
    await db.exec(`
      create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select false $$;
      create or replace function public.require_kin_plus() returns trigger language plpgsql security definer set search_path = public as $$
      begin
        if auth.uid() is not null and not public.family_has_plus(new.family_id) then
          raise exception 'kin_plus_required: % is part of Kin Plus', tg_argv[0];
        end if;
        return new;
      end $$;
      delete from health_medicine_alerts;
    `);
    return await refused(() => set(ANN, LOSARTAN, TITA_M, ANN_M), "kin_plus_required");
  });
  await check("The receiver check answers nothing about another household's medicine", async () => {
    const rows = await as(DAN, "select medicine_alert_receiver_ok($1, $2) as ok", [LOSARTAN, TITA_M]);
    return rows[0].ok === false || rows;
  });
  await check("The job's function is closed to a signed-in member without the secret", async () => {
    const rows = await as(ANN, "select * from due_missed_dose_alerts('nope', now())");
    return rows.length === 0;
  });
}
