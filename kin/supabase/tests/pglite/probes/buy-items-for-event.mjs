const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
// Things to buy, grouped under an event (20261012150000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), ben = U("b1");
  const [annEvent] = (await db.query(`insert into events (family_id, title) values ('${A}', 'Robin turns 8') returning id`)).rows;
  const [benEvent] = (await db.query(`insert into events (family_id, title) values ('${B}', 'Reunion') returning id`)).rows;

  await check("Ann puts a line on her list for her household's event", async () =>
    (await as(ann, "insert into buy_items (family_id, name, event_id) values ($1, 'Balloons', $2) returning id", [A, annEvent.id])).length === 1);
  await check("…and a line for no event at all, as before", async () =>
    (await as(ann, "insert into buy_items (family_id, name) values ($1, 'Rice') returning id", [A])).length === 1);
  await check("Nobody files a line under another household's event, adding or editing", async () => {
    const add = await refused(() => as(ann, "insert into buy_items (family_id, name, event_id) values ($1, 'Ice', $2)", [A, benEvent.id]));
    const move = await refused(() => as(ann, "update buy_items set event_id = $1 where name = 'Rice'", [benEvent.id]));
    const r = (await db.query("select event_id from buy_items where name = 'Rice'")).rows;
    return (add === true && move === true && r[0].event_id === null) || { add, move, r };
  });
  await check("Ben still can't see or touch Ann's lines", async () =>
    (await as(ben, "select 1 from buy_items where family_id = $1", [A])).length === 0);
  await check("Taking the event off the calendar keeps the line, just ungrouped", async () => {
    await as(ann, "delete from events where id = $1", [annEvent.id]);
    const r = (await db.query("select event_id from buy_items where name = 'Balloons'")).rows;
    return (r.length === 1 && r[0].event_id === null) || { r };
  });
}
