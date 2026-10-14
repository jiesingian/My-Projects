// Pills left and refill (20261014201000): only a grown-up of the household
// sets the count, what is on hand is worked out from the ticks (never counted
// down), and the job puts the medicine on the To-Buy list and tells the
// grown-ups once per supply cycle, in the household's own hours.
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const BEN = "10000000-0000-0000-0000-0000000000b1"; // parent in B
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const KID_M = "00000000-0000-0000-0000-0000000000a2";
const DAN_M = "00000000-0000-0000-0000-0000000000d1";
const LOLA_M = "00000000-0000-0000-0000-0000000000f4";
const MED = "e2000000-0000-0000-0000-000000000001";
const PRIV = "e2000000-0000-0000-0000-000000000002"; // Ann's private note of Lola's medicine
const ABE = "10000000-0000-0000-0000-0000000000a4"; // adult in A, own login
const ABE_M = "00000000-0000-0000-0000-0000000000a4";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  // The medicines' own visibility (20260926110000), in place of base.sql's
  // household-wide stand-in, so a private medicine is really hidden.
  await db.exec(`
    drop policy if exists hm_all on health_medicines;
    create policy hm_select on health_medicines for select using (
      family_id = current_family_id()
      and (visibility = 'family' or member_id = current_member_id() or created_by = current_member_id()
           or (visibility = 'parents' and current_member_role() = 'parent')));
    insert into members (id, family_id, auth_user_id, full_name, role) values ('${LOLA_M}', '${A}', null, 'Lola Reyes', 'adult');
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000a4', '${A}', 'https://push/Abe A', 'k', 'a');
    insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility, created_by) values
      ('${MED}', '${A}', '${LOLA_M}', 'Losartan', '{08:00,20:00}', current_date - 30, 'family', '${ANN_M}'),
      ('${PRIV}', '${A}', '${LOLA_M}', 'Sertraline', '{08:00}', current_date - 30, 'private', '${ANN_M}');
  `);
  const set = (who, counted, setBy, extra = "") =>
    as(who, `insert into health_medicine_supply (medicine_id, family_id, counted, set_by${extra ? ", counted_at" : ""}) values ($1, $2, $3, $4${extra ? `, '${extra}'` : ""}) returning counted_at`, [MED, A, counted, setBy]);
  const onHand = async (who = ANN) => Number((await as(who, "select medicine_on_hand($1) as n", [MED]))[0].n);
  const tick = (day, time) => db.query(`insert into health_medicine_doses (family_id, medicine_id, dose_date, dose_time) values ($1, $2, current_date + $3::int, $4)`, [A, MED, day, time]);

  await check("Another household cannot set a count on this household's medicine", async () => refused(() => set(DAN, 30, DAN_M)));
  await check("A forged household is refused", async () =>
    refused(() => as(ANN, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by) values ($1, $2, 30, $3)", [MED, D, ANN_M])));
  await check("A grown-up who cannot see a private medicine cannot count it", async () =>
    refused(() => as(ABE, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by) values ($1, $2, 30, $3)", [PRIV, A, ABE_M])));
  await check("A removed grown-up can no longer set one", async () => {
    await db.query("update members set status = 'removed' where id = $1", [ANN_M]);
    const r = await refused(() => set(ANN, 30, ANN_M));
    await db.query("update members set status = 'active' where id = $1", [ANN_M]);
    return r;
  });
  await check("Nothing is open to someone signed out", async () => {
    const tries = ["select medicine_on_hand($1)", "select add_to_medicine_supply($1, 30)"];
    const results = [];
    for (const sql of tries) {
      results.push(
        await refused(async () => {
          await db.exec("set role anon");
          try {
            await db.query(sql, [MED]);
          } finally {
            await db.exec("reset role");
          }
        }),
      );
    }
    return results.every((r) => r === true) || results;
  });
  await check("A child cannot set one", async () => refused(() => set(KID, 30, KID_M)));
  await check("A forged author is refused", async () => refused(() => set(ANN, 30, KID_M)));
  await check("A grown-up sets one, and when it was counted is the server's", async () => {
    const rows = await set(ANN, 30, ANN_M, "2020-01-01 00:00+00");
    return new Date(rows[0].counted_at) > new Date("2026-01-01") || rows;
  });
  await check("Another household cannot read it, or what is on hand", async () => {
    const ben = await as(BEN, "select * from health_medicine_supply");
    const dan = await as(DAN, "select medicine_on_hand($1) as n", [MED]);
    return (ben.length === 0 && dan[0].n === null) || [ben, dan];
  });
  await check("A child can see what is left but cannot change it or remove it", async () => {
    const seen = await as(KID, "select counted from health_medicine_supply");
    await as(KID, "update health_medicine_supply set counted = 999, set_by = $1", [KID_M]);
    await as(KID, "delete from health_medicine_supply");
    const r = (await db.query("select counted from health_medicine_supply")).rows;
    return (seen.length === 1 && r.length === 1 && Number(r[0].counted) === 30) || [seen, r];
  });
  await check("Another household cannot change it", async () => {
    await as(DAN, "update health_medicine_supply set counted = 999");
    await as(DAN, "select add_to_medicine_supply($1, 30)", [MED]);
    return Number((await db.query("select counted from health_medicine_supply")).rows[0].counted) === 30;
  });

  await check("On hand comes from the ticks: doses due after the count come off, earlier ones don't", async () => {
    await tick(-2, "08:00"); // before the count
    await tick(1, "08:00");
    await tick(1, "20:00");
    return (await onHand()) === 28 || (await onHand());
  });
  await check("Ticking the same dose twice counts once; unticking puts it back", async () => {
    await refused(() => tick(1, "08:00"));
    await db.query("delete from health_medicine_doses where dose_date = current_date + 1 and dose_time = '20:00'");
    return (await onHand()) === 29 || (await onHand());
  });
  await check("Per dose 2: each tick takes two", async () => {
    await as(ANN, "update health_medicine_supply set per_dose = 2, set_by = $1", [ANN_M]);
    return (await onHand()) === 28 || (await onHand());
  });
  await check("Changing only the per-dose amount keeps the cycle", async () => {
    const before = (await db.query("select counted_at from health_medicine_supply")).rows[0].counted_at;
    await as(ANN, "update health_medicine_supply set unit = 'capsule', set_by = $1, counted_at = '2020-01-01'", [ANN_M]);
    const after = (await db.query("select counted_at from health_medicine_supply")).rows[0].counted_at;
    return +after === +before || [before, after];
  });
  await check("Refilled, a box added: what is left plus the box, as a new count", async () => {
    const n = await as(ANN, "select add_to_medicine_supply($1, 30) as n", [MED]);
    // 28 left + 30. Tomorrow's 08:00, ticked early, already came off the 28,
    // so it does not come off the new count again.
    return (Number(n[0].n) === 58 && (await onHand()) === 58) || [n, await onHand()];
  });
  await check("A dose ticked after the new count comes off it", async () => {
    await tick(1, "20:00");
    return (await onHand()) === 56 || (await onHand());
  });
  await check("A child adding a box changes nothing", async () => {
    await as(KID, "select add_to_medicine_supply($1, 30)", [MED]);
    return Number((await db.query("select counted from health_medicine_supply")).rows[0].counted) === 58;
  });
  await check("A list item cannot be pinned on by a member (only the job records it)", async () => {
    const item = (await db.query("insert into buy_items (family_id, name) values ($1, 'Something') returning id", [A])).rows[0].id;
    await as(ANN, "update health_medicine_supply set list_item_id = $1, set_by = $2", [item, ANN_M]);
    const r = (await db.query("select list_item_id from health_medicine_supply")).rows[0];
    await db.query("delete from buy_items where id = $1", [item]);
    return r.list_item_id === null || r;
  });

  // The job. Back to one a dose, two doses a day, 10 left from now: 5 days.
  await as(ANN, "update health_medicine_supply set per_dose = 1, unit = 'tablet', counted = 10, set_by = $1", [ANN_M]);
  await db.query("delete from health_medicine_doses");
  // Tomorrow, 08:30 and 10:00 in Manila.
  const at = async (hhmm) => (await db.query(`select (current_date + 1 + time '${hhmm}') at time zone 'Asia/Manila' as t`)).rows[0].t;
  const run = async (when, secret = SECRET) => (await db.query("select * from due_refill_reminders($1, $2)", [secret, when])).rows;
  const who = (rows) => [...new Set(rows.map((r) => r.endpoint.split("/").pop()))].sort().join("|");

  await check("Without the secret nothing happens", async () => (await run(await at("10:00"), "wrong")).length === 0);
  await check("Not before 09:00 in the household", async () => (await run(await at("08:30"))).length === 0);
  await check("At 10:00: the grown-ups who can see it are told once, and it goes on the list in Personal Care", async () => {
    const rows = await run(await at("10:00"));
    const items = (await db.query("select name, section from buy_items where family_id = $1 and not checked and not cleared", [A])).rows;
    return (
      (who(rows) === "Abe A|Ann A" &&
        rows[0].title === "Lola's Losartan runs out in about 5 days" &&
        rows[0].body === "Added to the list." &&
        items.length === 1 &&
        items[0].name === "Losartan · for Lola, refill" &&
        items[0].section === "Personal Care") ||
      [rows, items]
    );
  });
  await check("Once per cycle: the next tick says nothing and adds nothing", async () => {
    const rows = await run(await at("10:05"));
    const items = (await db.query("select 1 from buy_items where family_id = $1", [A])).rows;
    return (rows.length === 0 && items.length === 1) || [rows, items];
  });
  await check("A new count starts a new cycle, but an open item already on the list is not added twice", async () => {
    await as(ANN, "update health_medicine_supply set counted = 4, set_by = $1", [ANN_M]);
    const rows = await run(await at("10:10"));
    const items = (await db.query("select 1 from buy_items where family_id = $1", [A])).rows;
    return (rows.length > 0 && rows[0].body === "It's already on the list." && rows[0].title === "Lola's Losartan runs out in about 2 days" && items.length === 1) || [rows, items];
  });
  await check("The Health switch off: that grown-up is not told", async () => {
    await db.query("update members set notification_prefs = '{\"health\": false}' where id = $1", [ANN_M]);
    await as(ANN, "update health_medicine_supply set counted = 0, set_by = $1", [ANN_M]);
    const rows = await run(await at("10:15"));
    await db.query("update members set notification_prefs = '{}' where id = $1", [ANN_M]);
    return (who(rows) === "Abe A" && rows[0].title === "Lola's Losartan has run out") || rows;
  });
  await check("A private medicine running low: only those who can see it are told, and it is not named on the shared list", async () => {
    await as(ANN, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by) values ($1, $2, 3, $3)", [PRIV, A, ANN_M]);
    const rows = (await run(await at("10:17"))).filter((r) => r.key.includes(PRIV));
    const items = (await db.query("select name from buy_items where name like 'Sertraline%'")).rows;
    return (
      (who(rows) === "Ann A" && rows[0].body === "Not added to the list, as this medicine isn't shown to everyone." && items.length === 0) || [rows, items]
    );
  });
  await check("Nor can a grown-up it is hidden from read what is left of it", async () => {
    const seen = await as(ABE, "select * from health_medicine_supply where medicine_id = $1", [PRIV]);
    const n = await as(ABE, "select medicine_on_hand($1) as n", [PRIV]);
    await as(ABE, "select add_to_medicine_supply($1, 30)", [PRIV]);
    const counted = Number((await db.query("select counted from health_medicine_supply where medicine_id = $1", [PRIV])).rows[0].counted);
    return (seen.length === 0 && n[0].n === null && counted === 3) || [seen, n, counted];
  });
  await db.query("delete from health_medicine_supply where medicine_id = $1", [PRIV]);
  await check("Plenty left: nothing", async () => {
    await as(ANN, "update health_medicine_supply set counted = 100, set_by = $1", [ANN_M]);
    return (await run(await at("10:20"))).length === 0;
  });

  await check("On Kin Free a count already kept can still be changed, and a box added", async () => {
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
    await as(ANN, "update health_medicine_supply set counted = 20, set_by = $1", [ANN_M]);
    const n = await as(ANN, "select add_to_medicine_supply($1, 30) as n", [MED]);
    return Number(n[0].n) === 50 || n;
  });
  await check("On Kin Free a new count is refused", async () => {
    await db.exec("delete from health_medicine_supply");
    return await refused(() => set(ANN, 30, ANN_M), "kin_plus_required");
  });
}
