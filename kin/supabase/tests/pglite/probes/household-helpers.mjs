// Helper access (20261015121000_household_helpers): Ann, a grown-up of House
// A, adds Hana as the household's helper. Hana is never a member: she sees the
// open To-Buy list, the meals and the children's plans only through the
// functions, only for House A, only while her switches are on and she has not
// been removed -- and nothing else of anybody's, ever. Dan does the same for
// House D, which is on Kin Free, with Hugo.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const HANA = "20000000-0000-0000-0000-0000000000f1";
const HUGO = "20000000-0000-0000-0000-0000000000f2";
const STRANGER = "20000000-0000-0000-0000-0000000000f3";
const TODAY = "(now() at time zone 'Asia/Manila')::date";
const AT = (dayOffset, hhmm) => `((${TODAY} + ${dayOffset})::timestamp + time '${hhmm}') at time zone 'Asia/Manila'`;

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  await db.exec(`
    -- The pantry's running-low flag (pre-pipeline table; 20260928100000),
    -- which a helper's tick clears as the family's does.
    create table if not exists pantry_items (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), item_key text not null, name text not null, running_low boolean not null default false, low_since timestamptz);
    alter table pantry_items enable row level security;
    insert into auth.users (id, email) values ('${HANA}', 'hana@example.test'), ('${HUGO}', 'hugo@example.test'), ('${STRANGER}', 'x@example.test');
    update families set access_status = 'expired', access_expires_at = now() - interval '1 day' where id = '${D}';
    insert into buy_items (id, family_id, name, section) values
      ('b1000000-0000-0000-0000-000000000001', '${A}', 'Gatas', 'Dairy'),
      ('b1000000-0000-0000-0000-000000000002', '${A}', 'Bigas', 'Rice');
    insert into buy_items (id, family_id, name, cleared) values ('b1000000-0000-0000-0000-000000000003', '${A}', 'Old line', true);
    insert into buy_items (id, family_id, name) values ('bd000000-0000-0000-0000-000000000001', '${D}', 'Dan coffee');
    insert into meal_plans (family_id, plan_date, slot, dish, note) values
      ('${A}', ${TODAY}, 'dinner', 'Sinigang', 'secret family note'),
      ('${A}', ${TODAY} + 1, 'lunch', 'Adobo', null),
      ('${A}', ${TODAY} + 5, 'lunch', 'Next week', null),
      ('${D}', ${TODAY}, 'dinner', 'Dan dinner', null);
    insert into activities (id, family_id, title, start_at, location, repeat, notes, status) values
      ('ac000000-0000-0000-0000-000000000001', '${A}', 'School pick-up', ${AT(0, "15:30")}, 'Ateneo Grade School', 'once', 'gate 3 password', 'upcoming'),
      ('ac000000-0000-0000-0000-000000000002', '${A}', 'Grown-ups dinner', ${AT(0, "19:00")}, 'Makati', 'once', null, 'upcoming'),
      ('ac000000-0000-0000-0000-000000000003', '${A}', 'Swimming', ${AT(-7, "09:00")}, 'Club pool', 'weekly', null, 'upcoming'),
      ('ac000000-0000-0000-0000-000000000004', '${A}', 'Dentist next week', ${AT(6, "10:00")}, 'Clinic', 'once', null, 'upcoming'),
      ('ac000000-0000-0000-0000-000000000005', '${D}', 'Dee recital', ${AT(0, "17:00")}, 'Hall', 'once', null, 'upcoming'),
      ('ac000000-0000-0000-0000-000000000006', '${A}', 'Cancelled tutor', ${AT(0, "16:00")}, 'Home', 'once', null, 'cancelled');
    insert into activities (id, family_id, title, start_at, location, repeat, repeat_until, status) values
      ('ac000000-0000-0000-0000-000000000007', '${A}', 'Ended ballet', ${AT(-14, "10:00")}, 'Studio', 'weekly', ${TODAY} - 1, 'upcoming');
    insert into activity_members (activity_id, member_id) values
      ('ac000000-0000-0000-0000-000000000001', '${P("a2")}'),
      ('ac000000-0000-0000-0000-000000000001', '${P("a1")}'),
      ('ac000000-0000-0000-0000-000000000002', '${P("a1")}'),
      ('ac000000-0000-0000-0000-000000000003', '${P("a3")}'),
      ('ac000000-0000-0000-0000-000000000004', '${P("a2")}'),
      ('ac000000-0000-0000-0000-000000000005', '${P("d2")}'),
      ('ac000000-0000-0000-0000-000000000006', '${P("a2")}'),
      ('ac000000-0000-0000-0000-000000000007', '${P("a2")}');
    insert into activities (id, family_id, title, start_at, location, repeat, status) values
      ('ac000000-0000-0000-0000-000000000008', '${A}', 'Lunch at Lola''s', ${AT(1, "12:00")}, 'Lola''s house', 'once', 'upcoming'),
      ('ac000000-0000-0000-0000-000000000009', '${A}', 'Town fiesta', ${AT(0, "08:00")}, 'Plaza', 'once', 'upcoming');
    insert into activity_members (activity_id, member_id) values ('ac000000-0000-0000-0000-000000000008', '${P("a1")}');
    -- "Whole family" ticked only on the lunch (tagged to a grown-up); the
    -- fiesta is tagged to nobody. The rest are not for the whole family, as
    -- the Planner saves a plan with that box left unticked.
    update activities set applies_to_whole_family = (id = 'ac000000-0000-0000-0000-000000000008');
    insert into health_vitals (family_id, member_id, vital_type, reading_date, value_text) values ('${A}', '${P("a1")}', 'bp', current_date, '120/80');
    insert into health_medicines (family_id, member_id) values ('${A}', '${P("a1")}');
    insert into family_vault_items (family_id, label) values ('${A}', 'Passport');
  `);

  const invite = (who, name = "Hana", list = true, meals = true, kids = false) =>
    as(who, "select * from create_helper_invite($1, $2, $3, $4)", [name, list, meals, kids]);

  // -- Who may invite ------------------------------------------------------
  await check("A child cannot add a helper", async () => refused(() => invite(kid), "grown-up"));
  await check("A stranger with no household cannot add a helper", async () => refused(() => invite(STRANGER), "grown-up"));
  await check("A name is required", async () => refused(() => invite(ann, "   "), "name"));
  const [{ helper_id: hanaId, code }] = await invite(ann);
  await check("Ann gets a one-time 10-character code", async () => /^[A-HJ-NP-Z2-9]{10}$/.test(code));
  await check("Ann and Abe see the helper; the child, Ben and Dan do not", async () =>
    (await as(ann, "select 1 from household_helpers")).length === 1 &&
    (await as(abe, "select 1 from household_helpers")).length === 1 &&
    (await as(kid, "select 1 from household_helpers")).length === 0 &&
    (await as(ben, "select 1 from household_helpers")).length === 0 &&
    (await as(dan, "select 1 from household_helpers")).length === 0);
  await check("Nobody writes the table directly, not even Ann", async () =>
    (await refused(() => as(ann, `insert into household_helpers (family_id, display_name) values ('${A}', 'Sneak')`))) === true &&
    (await refused(() => as(ann, `update household_helpers set can_see_kids_plans = true`))) === true);

  // -- The invite ---------------------------------------------------------
  await check("Hana sees what the link is for before accepting", async () => {
    const r = await as(HANA, "select * from helper_invite_preview($1)", [code.toLowerCase()]);
    return r.length === 1 && r[0].household === "House A" && r[0].helper_name === "Hana";
  });
  await check("A wrong code shows nothing", async () => (await as(HANA, "select * from helper_invite_preview('ZZZZZZZZZZ')")).length === 0);
  await check("Signed out, the code cannot be claimed", async () => refused(() => as(undefined, "select claim_helper_invite($1)", [code]), "Sign in"));
  await check("Ann, already in House A, cannot claim its helper link", async () => refused(() => as(ann, "select claim_helper_invite($1)", [code]), "already in this household"));
  await check("Hana claims it", async () => (await as(HANA, "select claim_helper_invite($1) as f", [code]))[0].f === A);
  await check("The code is single-use: Hugo cannot claim it after her", async () => refused(() => as(HUGO, "select claim_helper_invite($1)", [code]), "used or has expired"));
  await check("Nor can Hana claim it twice", async () => refused(() => as(HANA, "select claim_helper_invite($1)", [code])));

  await check("An expired invite cannot be claimed or previewed", async () => {
    const [{ code: late, helper_id: lateId }] = await invite(ann, "Late");
    await db.exec(`update household_helpers set invite_expires_at = now() - interval '1 minute' where id = '${lateId}'`);
    return (
      (await as(STRANGER, "select * from helper_invite_preview($1)", [late])).length === 0 &&
      (await refused(() => as(STRANGER, "select claim_helper_invite($1)", [late]), "expired")) === true
    );
  });
  await check("Invites run out after 7 days", async () =>
    (await as(ann, `select 1 from household_helpers where invite_code is not null and invite_expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'`)).length === 0 &&
    (await (async () => {
      const [{ helper_id: id }] = await invite(ann, "Week");
      return (await as(ann, `select 1 from household_helpers where id = '${id}' and invite_expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'`)).length === 1;
    })()));
  await check("A child cannot renew a link; Ann can, and the old code stops working", async () => {
    const [{ code: old, helper_id: id }] = await invite(ann, "Renew");
    const kidRefused = (await refused(() => as(kid, "select renew_helper_invite($1)", [id]))) === true;
    const [{ c }] = await as(ann, "select renew_helper_invite($1) as c", [id]);
    return kidRefused && c !== old && (await as(STRANGER, "select * from helper_invite_preview($1)", [old])).length === 0 &&
      (await as(STRANGER, "select * from helper_invite_preview($1)", [c])).length === 1;
  });
  await check("A claimed helper's link cannot be renewed", async () => refused(() => as(ann, "select renew_helper_invite($1)", [hanaId])));

  // -- What Hana sees, and does not ----------------------------------------
  await check("Hana helps House A, with its name and her switches only", async () => {
    const r = await as(HANA, "select * from my_helper_households()");
    return r.length === 1 && r[0].family_id === A && r[0].household === "House A" && r[0].can_see_list && r[0].can_see_meals && !r[0].can_see_kids_plans
      && Object.keys(r[0]).sort().join() === "can_see_kids_plans,can_see_list,can_see_meals,family_id,helper_id,helper_name,household,time_zone";
  });
  for (const table of ["members", "families", "accounts", "wealth_transactions", "health_vitals", "health_medicines", "health_medicine_supply", "family_vault_items", "journal_entries", "activities", "activity_members", "events", "meal_plans", "buy_items", "household_helpers", "assets", "planner_goals", "member_locations", "storage.objects", "family_link_messages"]) {
    await check(`Hana reads nothing from ${table} directly`, async () => (await as(HANA, `select 1 from ${table}`)).length === 0);
  }
  await check("Hana cannot make herself a member or a grown-up", async () =>
    (await refused(() => as(HANA, `insert into members (family_id, auth_user_id, full_name, role) values ('${A}', '${HANA}', 'Hana', 'parent')`))) === true &&
    (await as(HANA, `update members set role = 'parent' where family_id = '${A}' returning id`).catch(() => [])).length === 0 &&
    (await db.query(`select 1 from members where auth_user_id = '${HANA}'`)).rows.length === 0);
  await check("Hana cannot change her own switches, directly or by the function", async () =>
    (await refused(() => as(HANA, "select set_helper_access($1, true, true, true)", [hanaId]))) === true &&
    (await refused(() => as(HANA, `update household_helpers set can_see_kids_plans = true where id = '${hanaId}'`))) === true &&
    (await as(ann, `select can_see_kids_plans from household_helpers where id = '${hanaId}'`))[0].can_see_kids_plans === false);
  await check("Hana cannot remove helpers or add new ones", async () =>
    (await refused(() => as(HANA, "select remove_helper($1)", [hanaId]))) === true &&
    (await refused(() => invite(HANA, "Friend"))) === true);

  // -- The list ------------------------------------------------------------
  await check("Hana reads House A's open list, without cleared lines or prices", async () => {
    const r = await as(HANA, "select * from helper_buy_items($1)", [A]);
    return r.length === 2 && r.every((x) => x.item_name !== "Old line") && !("cost" in r[0]) && !("event_id" in r[0]);
  });
  await check("A forged household id is refused: Hana cannot read House D's list", async () => refused(() => as(HANA, "select * from helper_buy_items($1)", [D]), "not shared"));
  await check("Hana ticks Gatas; Ann sees it ticked", async () => {
    await as(HANA, "select helper_tick_buy_item($1, true)", ["b1000000-0000-0000-0000-000000000001"]);
    return (await as(ann, "select checked from buy_items where id = 'b1000000-0000-0000-0000-000000000001'"))[0].checked === true;
  });
  await check("And unticks it", async () => {
    await as(HANA, "select helper_tick_buy_item($1, false)", ["b1000000-0000-0000-0000-000000000001"]);
    return (await as(ann, "select checked from buy_items where id = 'b1000000-0000-0000-0000-000000000001'"))[0].checked === false;
  });
  await check("Hana cannot tick House D's line, nor a cleared one", async () =>
    (await refused(() => as(HANA, "select helper_tick_buy_item($1, true)", ["bd000000-0000-0000-0000-000000000001"]))) === true &&
    (await refused(() => as(HANA, "select helper_tick_buy_item($1, true)", ["b1000000-0000-0000-0000-000000000003"]))) === true &&
    (await db.query("select checked from buy_items where id = 'bd000000-0000-0000-0000-000000000001'")).rows[0].checked === false);
  await check("Hana adds Itlog; the family sees it, by Hana", async () => {
    await as(HANA, "select helper_add_buy_item($1, 'Itlog', 'Eggs')", [A]);
    const r = await as(ann, "select helper_name from buy_items where name = 'Itlog'");
    return r.length === 1 && r[0].helper_name === "Hana" && (await as(kid, "select helper_name from buy_items where name = 'Itlog'"))[0]?.helper_name === "Hana";
  });
  await check("Hana cannot add to House D's list", async () => refused(() => as(HANA, "select helper_add_buy_item($1, 'Sneaky', null)", [D])));
  await check("Forged author: Ann cannot add a line as Hana, nor rename who added one", async () =>
    (await refused(() => as(ann, `insert into buy_items (family_id, name, helper_id) values ('${A}', 'Fake', '${hanaId}')`), "helper")) === true &&
    (await refused(() => as(ann, `update buy_items set helper_name = 'Rosa' where name = 'Itlog'`))) === true &&
    (await refused(() => as(ann, `update buy_items set helper_name = 'Hana' where name = 'Bigas'`))) === true);
  await check("A name typed straight onto a member's line is dropped", async () => {
    await as(ann, `insert into buy_items (family_id, name, helper_name) values ('${A}', 'Typed', 'Rosa')`);
    return (await as(ann, "select helper_name from buy_items where name = 'Typed'"))[0].helper_name === null;
  });

  // -- Meals and the children's plans ----------------------------------------
  await check("Hana reads today's and tomorrow's meals, not next week's and not the note", async () => {
    const r = await as(HANA, "select * from helper_meals($1)", [A]);
    return r.length === 2 && r.map((m) => m.dish).join() === "Sinigang,Adobo" && !("note" in r[0]);
  });
  await check("House D's meals are refused to her", async () => refused(() => as(HANA, "select * from helper_meals($1)", [D])));
  await check("The children's plans are refused while that switch is off", async () => refused(() => as(HANA, "select * from helper_family_plans($1)", [A]), "not shared"));
  await check("A child cannot switch it on; Dan from House D cannot either", async () =>
    (await refused(() => as(kid, "select set_helper_access($1, true, true, true)", [hanaId]))) === true &&
    (await refused(() => as(dan, "select set_helper_access($1, true, true, true)", [hanaId]))) === true);
  await as(ann, "select set_helper_access($1, true, true, true)", [hanaId]);
  await check("Switched on: the children's and the whole family's plans (not a grown-up's own, a cancelled one or a repeat that has ended), with title, time, place and first names", async () => {
    const r = await as(HANA, "select * from helper_family_plans($1)", [A]);
    const titles = r.map((x) => x.title).sort().join();
    return titles === "Lunch at Lola's,School pick-up,Swimming,Town fiesta"
      && Object.keys(r[0]).sort().join() === "children,end_at,for_whole_family,place,repeat,repeat_days,repeat_until,start_at,title"
      && r.find((x) => x.title === "Lunch at Lola's").for_whole_family === true
      && r.find((x) => x.title === "Town fiesta").for_whole_family === true
      && r.find((x) => x.title === "Town fiesta").children.length === 0
      && r.find((x) => x.title === "School pick-up").for_whole_family === false
      && r.find((x) => x.title === "School pick-up").children.join() === "Kid"
      && r.find((x) => x.title === "School pick-up").place === "Ateneo Grade School";
  });
  await check("House D's children's plans are refused to her", async () => refused(() => as(HANA, "select * from helper_family_plans($1)", [D])));

  // -- Switches off, Kin Free, removal ---------------------------------------
  await as(ann, "select set_helper_access($1, false, true, true)", [hanaId]);
  await check("List switched off: Hana can neither read, tick nor add", async () =>
    (await refused(() => as(HANA, "select * from helper_buy_items($1)", [A]))) === true &&
    (await refused(() => as(HANA, "select helper_tick_buy_item($1, true)", ["b1000000-0000-0000-0000-000000000002"]))) === true &&
    (await refused(() => as(HANA, "select helper_add_buy_item($1, 'More', null)", [A]))) === true);
  await as(ann, "select set_helper_access($1, true, true, true)", [hanaId]);

  await check("Kin Free: Dan (House D, trial over) adds Hugo, who uses D's list", async () => {
    const [{ code: dc }] = await invite(dan, "Hugo");
    await as(HUGO, "select claim_helper_invite($1)", [dc]);
    const r = await as(HUGO, "select * from helper_buy_items($1)", [D]);
    return r.length === 1 && r[0].item_name === "Dan coffee";
  });
  await check("Hugo cannot read House A's list; Dan cannot see or remove Hana", async () =>
    (await refused(() => as(HUGO, "select * from helper_buy_items($1)", [A]))) === true &&
    (await as(dan, `select 1 from household_helpers where id = '${hanaId}'`)).length === 0 &&
    (await refused(() => as(dan, "select remove_helper($1)", [hanaId]))) === true);
  await check("A child cannot remove Hana", async () => refused(() => as(kid, "select remove_helper($1)", [hanaId])));

  await as(ann, "select remove_helper($1)", [hanaId]);
  await check("Removed: Hana helps nobody and every function refuses her at once", async () =>
    (await as(HANA, "select * from my_helper_households()")).length === 0 &&
    (await refused(() => as(HANA, "select * from helper_buy_items($1)", [A]))) === true &&
    (await refused(() => as(HANA, "select helper_tick_buy_item($1, true)", ["b1000000-0000-0000-0000-000000000002"]))) === true &&
    (await refused(() => as(HANA, "select helper_add_buy_item($1, 'After', null)", [A]))) === true &&
    (await refused(() => as(HANA, "select * from helper_meals($1)", [A]))) === true &&
    (await refused(() => as(HANA, "select * from helper_family_plans($1)", [A]))) === true);
  await check("Her lines keep her name on the family's list", async () => (await as(ann, "select helper_name from buy_items where name = 'Itlog'"))[0].helper_name === "Hana");
  await check("Removed twice is refused, and the old code still does nothing", async () =>
    (await refused(() => as(ann, "select remove_helper($1)", [hanaId]))) === true &&
    (await refused(() => as(HANA, "select claim_helper_invite($1)", [code]))) === true);
  await check("Ann can invite Hana again with a fresh link", async () => {
    const [{ code: again }] = await invite(ann, "Hana");
    await as(HANA, "select claim_helper_invite($1)", [again]);
    return (await as(HANA, "select * from my_helper_households()")).length === 1;
  });
  // -- Review: more ways in ----------------------------------------------------
  const helperFns = [
    "create_helper_invite(text,boolean,boolean,boolean)", "renew_helper_invite(uuid)", "set_helper_access(uuid,boolean,boolean,boolean)",
    "remove_helper(uuid)", "helper_invite_preview(text)", "claim_helper_invite(text)", "my_helper_households()",
    "helper_buy_items(uuid)", "helper_add_buy_item(uuid,text,text)", "helper_tick_buy_item(uuid,boolean)",
    "helper_meals(uuid)", "helper_family_plans(uuid)",
  ];
  const internalFns = ["new_helper_code()", "helper_row_for(uuid,text)", "buy_items_helper_author()"];
  await check("Signed-out visitors cannot run any helper function; nobody but the functions runs the internal ones", async () => {
    const r = await db.query(
      `select f from unnest($1::text[]) f where has_function_privilege('anon', 'public.' || f, 'execute')
       union all select f from unnest($2::text[]) f where has_function_privilege('authenticated', 'public.' || f, 'execute') or has_function_privilege('anon', 'public.' || f, 'execute')`,
      [helperFns, internalFns],
    );
    return r.rows.length === 0 || r.rows.map((x) => x.f);
  });
  await check("Every helper function is security definer with an empty search_path", async () => {
    const names = [...helperFns, ...internalFns].map((f) => f.split("(")[0]);
    const r = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1) and not (p.prosecdef and coalesce(p.proconfig, '{}') @> array['search_path=""'])`,
      [names],
    );
    const found = (await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [names])).rows[0].n;
    return (r.rows.length === 0 && found === names.length) || { bad: r.rows.map((x) => x.proname), found };
  });
  await check("Hana cannot write buy_items straight to the table, even with her own helper id", async () =>
    (await refused(() => as(HANA, `insert into buy_items (family_id, name) values ('${A}', 'Direct')`))) === true &&
    (await refused(() => as(HANA, `insert into buy_items (family_id, name, helper_id) values ('${A}', 'Direct', (select id from household_helpers limit 1))`))) === true &&
    (await as(HANA, `update buy_items set checked = true where family_id = '${A}' returning id`).catch(() => [])).length === 0 &&
    (await as(HANA, `delete from buy_items where family_id = '${A}' returning id`).catch(() => [])).length === 0);
  await check("No household, no item: null and made-up ids are refused", async () =>
    (await refused(() => as(HANA, "select * from helper_buy_items(null)"))) === true &&
    (await refused(() => as(HANA, "select helper_tick_buy_item($1, true)", ["b1000000-0000-0000-0000-0000000000ff"]))) === true &&
    (await refused(() => as(HANA, "select * from helper_meals(null)"))) === true);
  await check("Members are not helpers: Ann and the child get nothing from the helper functions", async () =>
    (await refused(() => as(ann, "select * from helper_buy_items($1)", [A]))) === true &&
    (await refused(() => as(kid, "select * from helper_meals($1)", [A]))) === true &&
    (await refused(() => as(kid, "select helper_add_buy_item($1, 'Candy', null)", [A]))) === true &&
    (await as(kid, "select * from my_helper_households()")).length === 0);
  await check("A grown-up whose joining is still pending cannot see or add helpers", async () => {
    const PEND = "20000000-0000-0000-0000-0000000000f4";
    await db.exec(`insert into members (family_id, auth_user_id, full_name, role, status) values ('${A}', '${PEND}', 'Pending Pia', 'adult', 'pending')`);
    return (await as(PEND, "select 1 from household_helpers")).length === 0 &&
      (await refused(() => invite(PEND, "Sneak"), "grown-up")) === true;
  });
  await check("Hana cannot take a second link to the same household; the link stays good for its helper", async () => {
    const [{ code: second }] = await invite(ann, "Second");
    return (await refused(() => as(HANA, "select claim_helper_invite($1)", [second]), "already help")) === true &&
      (await as(STRANGER, "select * from helper_invite_preview($1)", [second])).length === 1;
  });
  await check("Dan, a grown-up of House D, helps House A too: nothing of A's reaches him as a member, and his helper row cannot sign House D's lines", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${dan}', 'dan@example.test') on conflict do nothing`);
    const [{ code: dc }] = await invite(ann, "Dan");
    await as(dan, "select claim_helper_invite($1)", [dc]);
    const dHelper = (await db.query(`select id from household_helpers where user_id = '${dan}' and family_id = '${A}'`)).rows[0].id;
    return (await as(dan, "select * from helper_buy_items($1)", [A])).length > 0 &&
      (await as(dan, `select 1 from members where family_id = '${A}'`)).length === 0 &&
      (await as(dan, `select 1 from household_helpers where family_id = '${A}'`)).length === 0 &&
      (await refused(() => as(dan, `insert into buy_items (family_id, name, helper_id) values ('${D}', 'As helper', '${dHelper}')`), "helper")) === true &&
      (await refused(() => as(dan, `update buy_items set helper_id = '${dHelper}' where family_id = '${D}'`))) === true &&
      (await refused(() => as(dan, `insert into buy_items (family_id, name) values ('${A}', 'Into A')`))) === true;
  });
  await check("Hana's tick clears the pantry's running-low flag for that name, in House A only", async () => {
    await db.exec(`insert into pantry_items (family_id, item_key, name, running_low, low_since) values ('${A}', 'kape', 'Kape', true, now()), ('${D}', 'kape', 'Kape', true, now())`);
    await as(HANA, "select helper_add_buy_item($1, '  Kape ', null)", [A]);
    const [{ item_id }] = (await as(HANA, "select * from helper_buy_items($1)", [A])).filter((x) => x.item_name === "Kape");
    await as(HANA, "select helper_tick_buy_item($1, true)", [item_id]);
    const r = (await db.query("select family_id, running_low from pantry_items where item_key = 'kape' order by family_id")).rows;
    return r.length === 2 && r[0].running_low === false && r[1].running_low === true;
  });
  await check("The family still edits and ticks a helper's line after she is gone", async () => {
    await as(ann, `update buy_items set checked = true, name = 'Itlog (12)' where name = 'Itlog'`);
    return (await as(ann, "select helper_name, checked from buy_items where name = 'Itlog (12)'"))[0]?.checked === true;
  });
  await check("A helper who deletes their account leaves their name on their lines", async () => {
    await as(HUGO, "select helper_add_buy_item($1, 'Asukal', null)", [D]);
    await db.exec(`delete from auth.users where id = '${HUGO}'`);
    const r = (await db.query(`select helper_id, helper_name from buy_items where name = 'Asukal'`)).rows;
    return r.length === 1 && r[0].helper_id === null && r[0].helper_name === "Hugo";
  });
  await check("The meals still come back when the real columns are narrower (smallint position, varchar dish)", async () => {
    await db.exec("alter table meal_plans alter column position type smallint, alter column dish type varchar(200)");
    return (await as(HANA, "select * from helper_meals($1)", [A])).length === 2;
  });
  await check("A household zone Postgres does not know reads as Manila, rather than failing", async () => {
    await db.exec(`update families set time_zone = 'Mars/Olympus' where id = '${A}'`).catch(() => {});
    const tz = (await db.query(`select time_zone from families where id = '${A}'`)).rows[0]?.time_zone;
    const r = await as(HANA, "select * from my_helper_households()");
    const ok = (await as(HANA, "select * from helper_meals($1)", [A])).length === 2 && r[0].time_zone === (tz === "Mars/Olympus" ? "Asia/Manila" : tz);
    await db.exec(`update families set time_zone = 'Asia/Manila' where id = '${A}'`);
    return ok;
  });

  await check("A household holds at most 10 live helpers", async () => {
    for (let i = 0; i < 10; i++) {
      try { await invite(abe, `Extra ${i}`); } catch { return (await refused(() => invite(abe, "One more"), "up to 10")) === true; }
    }
    return refused(() => invite(abe, "One more"), "up to 10");
  });
}
