// The To-Buy list, live, and the helper's push (20261019140000): one empty
// nudge per household per change, heard only by the household and its
// helpers who can see the list; and a push to a helper who asked for one,
// only for a line a member just added.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(here, "..", "..", "..", "migrations", "20261019140000_buy_list_live_and_helper_push.sql");
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const HANA = "20000000-0000-0000-0000-0000000000f1";
const GONE = "20000000-0000-0000-0000-0000000000f2";
const NOLIST = "20000000-0000-0000-0000-0000000000f3";
const H_HANA = "21000000-0000-0000-0000-0000000000f1";
const H_GONE = "21000000-0000-0000-0000-0000000000f2";
const H_NOLIST = "21000000-0000-0000-0000-0000000000f3";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  // Realtime as Supabase has it, enough to test against: a messages table
  // the policy sits on, topic() read from a setting, and send() writing a row.
  await db.exec(`
    -- The pantry (pre-pipeline table), which a helper's tick touches.
    create table if not exists pantry_items (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), item_key text not null, name text not null, running_low boolean not null default false, low_since timestamptz);
    create schema if not exists realtime;
    create table realtime.messages (id bigserial primary key, topic text not null, extension text not null default 'broadcast', event text, payload jsonb, private boolean);
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to authenticated;
    grant select on realtime.messages to authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
      insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$;
    insert into auth.users (id, email) values ('${HANA}', 'hana@example.test'), ('${GONE}', 'gone@example.test'), ('${NOLIST}', 'nolist@example.test');
    insert into household_helpers (id, family_id, user_id, display_name, can_see_list, claimed_at, removed_at) values
      ('${H_HANA}', '${A}', '${HANA}', 'Hana', true, now(), null),
      ('${H_GONE}', '${A}', '${GONE}', 'Gone', true, now(), now()),
      ('${H_NOLIST}', '${A}', '${NOLIST}', 'No list', false, now(), null);
  `);
  // The migration again, now that there is a realtime.messages for its policy.
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));

  const nudges = async () => (await db.query("select topic, payload from realtime.messages order by id")).rows;
  const reset = () => db.exec("delete from realtime.messages");
  const hears = async (who, topic) => {
    await db.query("select set_config('test.topic', $1, false)", [topic]);
    await db.query("insert into realtime.messages (topic, payload) values ($1, '{}')", [topic]);
    const r = (await as(who, "select 1 from realtime.messages where topic = $1", [topic])).length > 0;
    await reset();
    return r;
  };

  await reset();
  await check("A line added sends one empty nudge on the household's topic", async () => {
    await as(ann, "insert into buy_items (family_id, name, created_by) values ($1, 'Gatas', $2)", [A, M("a1")]);
    const n = await nudges();
    return n.length === 1 && n[0].topic === `buy-list:${A}` && JSON.stringify(n[0].payload) === "{}";
  });
  await check("Thirty lines cleared at once are one nudge, not thirty", async () => {
    await db.exec(`insert into buy_items (family_id, name) select '${A}', 'x' || g from generate_series(1, 30) g`);
    await reset();
    await as(ann, "update buy_items set cleared = true where family_id = $1 and name like 'x%'", [A]);
    return (await nudges()).length === 1;
  });
  await check("A change in two households at once nudges each", async () => {
    await reset();
    await db.exec(`insert into buy_items (family_id, name) values ('${A}', 'a'), ('${B}', 'b')`);
    return JSON.stringify((await nudges()).map((n) => n.topic).sort()) === JSON.stringify([`buy-list:${A}`, `buy-list:${B}`]);
  });
  await check("A helper's tick nudges too, so the family sees it", async () => {
    const id = (await db.query(`insert into buy_items (family_id, name) values ('${A}', 'Itlog') returning id`)).rows[0].id;
    await reset();
    await as(HANA, "select helper_tick_buy_item($1, true)", [id]);
    return (await nudges()).length === 1;
  });
  await check("Deleting a line nudges", async () => {
    await reset();
    await as(ann, "delete from buy_items where family_id = $1 and name = 'a'", [A]);
    return (await nudges()).length === 1;
  });
  await check("A failure to send never fails the write", async () => {
    await db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$ begin raise exception 'realtime is down'; end $$`);
    const r = (await as(ann, "insert into buy_items (family_id, name, created_by) values ($1, 'Asukal', $2) returning id", [A, M("a1")])).length === 1;
    await db.exec(`create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
      insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$`);
    return r;
  });

  await check("The household hears its own topic: a grown-up and a child", async () => (await hears(ann, `buy-list:${A}`)) && (await hears(kid, `buy-list:${A}`)));
  await check("Its helper who can see the list hears it", async () => hears(HANA, `buy-list:${A}`));
  await check("A removed helper does not, nor one without the list", async () => !(await hears(GONE, `buy-list:${A}`)) && !(await hears(NOLIST, `buy-list:${A}`)));
  await check("A linked household and a stranger do not", async () => !(await hears(ben, `buy-list:${A}`)) && !(await hears(dan, `buy-list:${A}`)));
  await check("The helper hears no other household's list", async () => !(await hears(HANA, `buy-list:${B}`)));
  await check("A topic that is not a list's is not this policy's to allow", async () => !(await hears(HANA, `family-chat:${A}`)) && !(await hears(ann, "buy-list:not-a-uuid")));
  await check("Nobody can send on the topic from a browser", async () =>
    refused(() => as(ann, "insert into realtime.messages (topic, payload) values ($1, '{}')", [`buy-list:${A}`])));

  await check("The helper asks to be told, on this phone", async () => {
    await as(HANA, "select save_helper_push($1, 'https://push/hana', 'k', 'a')", [A]);
    return (await as(HANA, "select helper_push_saved($1, 'https://push/hana') as on", [A]))[0].on === true;
  });
  await check("A helper without the list, a removed one or a stranger cannot", async () =>
    (await refused(() => as(NOLIST, "select save_helper_push($1, 'https://push/x', 'k', 'a')", [A]))) === true &&
    (await refused(() => as(GONE, "select save_helper_push($1, 'https://push/y', 'k', 'a')", [A]))) === true &&
    (await refused(() => as(dan, "select save_helper_push($1, 'https://push/z', 'k', 'a')", [A]))) === true);
  await check("Nobody reads the table directly", async () => refused(() => as(HANA, "select * from helper_push_subscriptions")));

  const add = async (who, member) => (await as(who, "insert into buy_items (family_id, name, created_by) values ($1, 'Kape', $2) returning id", [A, member]))[0].id;
  const targets = async (who, item) => (await as(who, "select endpoint from helper_push_targets($1)", [item])).map((r) => r.endpoint);
  await check("A member adds a line: the helper's phone is the target", async () => JSON.stringify(await targets(ann, await add(ann, M("a1")))) === JSON.stringify(["https://push/hana"]));
  await check("A child adding one reaches her too", async () => JSON.stringify(await targets(kid, await add(kid, M("a2")))) === JSON.stringify(["https://push/hana"]));
  await check("Only for a line the caller added", async () => {
    const item = await add(ann, M("a1"));
    return (await targets(kid, item)).length === 0 && (await targets(ben, item)).length === 0 && (await targets(HANA, item)).length === 0;
  });
  await check("Not for a line the helper added herself", async () => {
    const id = (await as(HANA, "select helper_add_buy_item($1, 'Toyo', 'Other') as id", [A]))[0].id;
    await db.query("update buy_items set created_by = $2 where id = $1", [id, M("a1")]);
    return (await targets(ann, id)).length === 0;
  });
  await check("Not for an old line: no ringing the helper on demand", async () => {
    const item = await add(ann, M("a1"));
    await db.query("update buy_items set created_at = now() - interval '10 minutes' where id = $1", [item]);
    return (await targets(ann, item)).length === 0;
  });
  await check("Once she is removed, or the list is switched off, no push", async () => {
    await db.exec(`update household_helpers set can_see_list = false where id = '${H_HANA}'`);
    const off = (await targets(ann, await add(ann, M("a1")))).length === 0;
    await db.exec(`update household_helpers set can_see_list = true, removed_at = now() where id = '${H_HANA}'`);
    const gone = (await targets(ann, await add(ann, M("a1")))).length === 0;
    await db.exec(`update household_helpers set removed_at = null where id = '${H_HANA}'`);
    return off && gone;
  });
  await check("Another household cannot forget her phone; her own household can", async () => {
    await as(ben, "select forget_helper_push_endpoint('https://push/hana')");
    const kept = (await db.query("select count(*)::int as n from helper_push_subscriptions")).rows[0].n === 1;
    await as(ann, "select forget_helper_push_endpoint('https://push/hana')");
    return kept && (await db.query("select count(*)::int as n from helper_push_subscriptions")).rows[0].n === 0;
  });
  await check("She turns it off herself", async () => {
    await as(HANA, "select save_helper_push($1, 'https://push/hana', 'k', 'a')", [A]);
    await as(ben, "select remove_helper_push($1, 'https://push/hana')", [A]);
    const kept = (await as(HANA, "select helper_push_saved($1, 'https://push/hana') as on", [A]))[0].on;
    await as(HANA, "select remove_helper_push($1, 'https://push/hana')", [A]);
    return kept === true && (await as(HANA, "select helper_push_saved($1, 'https://push/hana') as on", [A]))[0].on === false;
  });

  await check("Signed-out callers cannot run the functions", async () =>
    (await db.query(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) as any from pg_proc p
      where p.proname in ('buy_list_topic_is_mine', 'buy_items_nudge', 'save_helper_push', 'remove_helper_push', 'helper_push_saved', 'helper_push_targets', 'forget_helper_push_endpoint')`)).rows[0].any === false);
  await check("Nor can a signed-in browser fire the nudge by hand", async () =>
    (await db.query(`select has_function_privilege('authenticated', 'public.buy_items_nudge()', 'execute') as ok`)).rows[0].ok === false);
  await check("The functions keep an empty search_path", async () =>
    (await db.query(`select count(*)::int as n from pg_proc where proname in ('buy_list_topic_is_mine', 'buy_items_nudge', 'save_helper_push', 'remove_helper_push', 'helper_push_saved', 'helper_push_targets', 'forget_helper_push_endpoint')
      and not ('search_path=""' = any(proconfig))`)).rows[0].n === 0);
}
