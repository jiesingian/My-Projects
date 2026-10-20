// A helper's list says "Medicine refill" (20261020160000): the line the job
// adds when Lola's Losartan runs low reads "Losartan · for Lola, refill" to
// Ann's family and "Medicine refill" to Hana, the helper -- with the store
// once Ann says one, and by name only once Ann ticks "show the name". A line
// Ann types herself is never touched, and a store named on another
// household's medicine never shows on this one's helper page.
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const KID = "10000000-0000-0000-0000-0000000000a2";
const DAN = "10000000-0000-0000-0000-0000000000d1";
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const KID_M = "00000000-0000-0000-0000-0000000000a2";
const DAN_M = "00000000-0000-0000-0000-0000000000d1";
const LOLA_M = "00000000-0000-0000-0000-0000000000f4";
const MED = "e3000000-0000-0000-0000-000000000001";
const DMED = "e3000000-0000-0000-0000-0000000000d1";
const HANA = "20000000-0000-0000-0000-0000000000f1";

export default async function ({ db, as, check, refused }) {
  await db.exec(`
    -- The pantry's running-low flag (pre-pipeline table), which a helper's
    -- tick clears, as household-helpers.mjs stands it in.
    create table if not exists pantry_items (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), item_key text not null, name text not null, running_low boolean not null default false, low_since timestamptz);
    alter table pantry_items enable row level security;
    insert into auth.users (id, email) values ('${HANA}', 'hana@example.test');
    insert into members (id, family_id, auth_user_id, full_name, role) values ('${LOLA_M}', '${A}', null, 'Lola Reyes', 'adult');
    insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility, created_by) values
      ('${MED}', '${A}', '${LOLA_M}', 'Losartan', '{08:00,20:00}', current_date - 30, 'family', '${ANN_M}'),
      ('${DMED}', '${D}', '${DAN_M}', 'Metformin', '{08:00}', current_date - 30, 'family', '${DAN_M}');
    insert into health_medicine_supply (medicine_id, family_id, counted, set_by, store) values ('${DMED}', '${D}', 2, '${DAN_M}', 'Watsons Dan');
  `);
  const [{ code }] = await as(ANN, "select * from create_helper_invite('Hana', true, false, false)");
  await as(HANA, "select claim_helper_invite($1)", [code]);
  const at = async (hhmm) => (await db.query(`select (current_date + 1 + time '${hhmm}') at time zone 'Asia/Manila' as t`)).rows[0].t;
  // The job runs with nobody signed in; as() leaves the last caller's claims
  // in the session, and the supply row's trigger reads auth.uid().
  const run = async (hhmm) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    return (await db.query("select * from due_refill_reminders($1, $2)", [SECRET, await at(hhmm)])).rows;
  };
  const hana = async () => (await as(HANA, "select * from helper_buy_items($1)", [A])).map((r) => r.item_name).sort();
  const family = async () => (await as(ANN, "select name from buy_items where family_id = $1 and not cleared order by name", [A])).map((r) => r.name);

  await check("A store longer than 60 characters, or empty, is refused", async () =>
    (await refused(() => as(ANN, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by, store) values ($1, $2, 3, $3, repeat('x', 61))", [MED, A, ANN_M]))) === true &&
    (await refused(() => as(ANN, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by, store) values ($1, $2, 3, $3, '')", [MED, A, ANN_M]))) === true);
  await as(ANN, "insert into health_medicine_supply (medicine_id, family_id, counted, set_by) values ($1, $2, 3, $3)", [MED, A, ANN_M]);
  await check("Shown to the helper is off to begin with", async () =>
    (await as(ANN, "select show_name_to_helper, store from health_medicine_supply where medicine_id = $1", [MED]))[0].show_name_to_helper === false);

  await check("The job adds the refill line with the medicine's id on it", async () => {
    const rows = await run("10:00");
    const items = (await db.query("select name, medicine_id from buy_items where family_id = $1", [A])).rows;
    return (rows.length > 0 && rows[0].body === "Added to the list." && items.length === 1 && items[0].name === "Losartan · for Lola, refill" && items[0].medicine_id === MED) || [rows, items];
  });
  await check("The family reads the line by name; Hana reads \"Medicine refill\"", async () =>
    (await family()).join() === "Losartan · for Lola, refill" && (await hana()).join() === "Medicine refill");
  await check("A line Ann types herself, medicine or not, reads as typed", async () => {
    await as(ANN, `insert into buy_items (family_id, name) values ('${A}', 'Biogesic for Kid')`);
    return (await hana()).join() === "Biogesic for Kid,Medicine refill";
  });
  await check("The store shows once Ann names it: \"Medicine refill · Mercury Drug\"", async () => {
    await as(ANN, "update health_medicine_supply set store = '  Mercury Drug ', set_by = $1 where medicine_id = $2", [ANN_M, MED]);
    return (await hana()).join() === "Biogesic for Kid,Medicine refill · Mercury Drug";
  });
  await check("Naming a store or showing the name does not start a new supply cycle", async () => {
    const before = (await db.query("select counted_at, list_item_id from health_medicine_supply where medicine_id = $1", [MED])).rows[0];
    await as(ANN, "update health_medicine_supply set show_name_to_helper = true, set_by = $1 where medicine_id = $2", [ANN_M, MED]);
    const after = (await db.query("select counted_at, list_item_id from health_medicine_supply where medicine_id = $1", [MED])).rows[0];
    return (String(before.counted_at) === String(after.counted_at) && before.list_item_id === after.list_item_id && before.list_item_id !== null) || [before, after];
  });
  await check("With \"show the name\" on, Hana reads the medicine's name", async () => (await hana()).join() === "Biogesic for Kid,Losartan · for Lola, refill");
  await check("A child cannot turn it on; another household cannot either", async () => {
    await as(ANN, "update health_medicine_supply set show_name_to_helper = false, set_by = $1 where medicine_id = $2", [ANN_M, MED]);
    const kid = await refused(() => as(KID, "update health_medicine_supply set show_name_to_helper = true, set_by = $1 where medicine_id = $2 returning 1", [KID_M, MED]));
    const kidRows = (await as(KID, "update health_medicine_supply set show_name_to_helper = true where medicine_id = $1 returning 1", [MED]).catch(() => [])).length;
    const danRows = (await as(DAN, "update health_medicine_supply set show_name_to_helper = true, set_by = $1 where medicine_id = $2 returning 1", [DAN_M, MED]).catch(() => [])).length;
    const flag = (await db.query("select show_name_to_helper from health_medicine_supply where medicine_id = $1", [MED])).rows[0].show_name_to_helper;
    return (kidRows === 0 && danRows === 0 && flag === false) || [kid, kidRows, danRows, flag];
  });
  await check("Hana ticks the refill line; the family sees it ticked", async () => {
    const id = (await db.query("select id from buy_items where medicine_id = $1", [MED])).rows[0].id;
    await as(HANA, "select helper_tick_buy_item($1, true)", [id]);
    return (await as(ANN, "select checked from buy_items where id = $1", [id]))[0].checked === true;
  });
  await check("A new count clears list_item_id, but the open line is still a refill line to Hana", async () => {
    await db.query("update buy_items set checked = false where medicine_id = $1", [MED]);
    await as(ANN, "update health_medicine_supply set counted = 2, set_by = $1 where medicine_id = $2", [ANN_M, MED]);
    const link = (await db.query("select list_item_id from health_medicine_supply where medicine_id = $1", [MED])).rows[0].list_item_id;
    return (link === null && (await hana()).join() === "Biogesic for Kid,Medicine refill · Mercury Drug") || [link, await hana()];
  });
  await check("The job sees the open refill line and does not add a second", async () => {
    const rows = await run("10:05");
    return (rows.length > 0 && rows[0].body === "It's already on the list." && (await family()).length === 2) || [rows, await family()];
  });
  await check("Counting stopped: the line stays hidden, now without a store", async () => {
    await as(ANN, "delete from health_medicine_supply where medicine_id = $1", [MED]);
    return (await hana()).join() === "Biogesic for Kid,Medicine refill";
  });
  await check("A forged medicine id on Ann's own line never shows another household's store", async () => {
    await as(ANN, `insert into buy_items (family_id, name, medicine_id) values ('${A}', 'Sneaky', '${DMED}')`);
    return (await hana()).join() === "Biogesic for Kid,Medicine refill,Medicine refill";
  });
  await check("Hana reads nothing of the supply rows themselves", async () => (await as(HANA, "select 1 from health_medicine_supply")).length === 0);
}
