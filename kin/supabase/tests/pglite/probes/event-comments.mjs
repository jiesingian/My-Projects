const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// A thread on each event (20261014100000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const annM = P("a1"), kidM = P("a2"), babyM = P("a3"), abeM = P("a4"), danM = P("d1");
  const ev = (await db.query("insert into events (family_id, title) values ($1, 'Party') returning id", [A])).rows[0].id;
  const dans = (await db.query("insert into events (family_id, title) values ($1, 'BBQ') returning id", [D])).rows[0].id;
  const post = (who, member, body = "See you there", event = ev, family = A) =>
    as(who, "insert into event_comments (event_id, family_id, member_id, body) values ($1, $2, $3, $4) returning id", [event, family, member, body]);

  let annC, kidC;
  await check("Ann posts in her own name; Kid (a child) posts too", async () => {
    annC = (await post(ann, annM))[0]?.id;
    kidC = (await post(kid, kidM, "Can I bring a friend?"))[0]?.id;
    return !!annC && !!kidC;
  });
  await check("Nobody posts in someone else's name: a forged member, a managed child, another household's member", async () =>
    (await refused(() => post(kid, annM))) === true &&
    (await refused(() => post(ann, babyM))) === true &&
    (await refused(() => post(ann, danM))) === true);
  await check("An empty comment is refused", async () => refused(() => post(ann, annM, "   ")));
  await check("The household reads the whole thread, a child included", async () =>
    (await as(kid, "select 1 from event_comments where event_id = $1", [ev])).length === 2 &&
    (await as(abe, "select 1 from event_comments where event_id = $1", [ev])).length === 2);
  await check("A linked household (Ben), a non-sharing one (Cat) and a stranger (Dan) read nothing", async () => {
    const n = await Promise.all([ben, cat, dan].map(async (u) => (await as(u, "select 1 from event_comments")).length));
    return n.every((x) => x === 0) || n;
  });
  await check("A linked household and a stranger can't post on an event they can't see", async () =>
    (await refused(() => post(ben, P("b1"), "hi", ev, A))) === true &&
    (await refused(() => post(dan, danM, "hi", ev, D))) === true &&
    (await refused(() => post(dan, danM, "hi", ev, A))) === true);
  await check("Dan can't hang a comment on House A's event by naming his own household", async () =>
    (await refused(() => post(dan, danM, "x", ev, D))) === true && (await post(dan, danM, "on mine", dans, D)).length === 1);
  await check("Ann edits her own: the words change and it says edited", async () => {
    const r = (await as(ann, "update event_comments set body = 'See you at 6' where id = $1 returning body, edited_at", [annC]))[0];
    return (r?.body === "See you at 6" && r.edited_at !== null) || r;
  });
  await check("Nobody edits or deletes someone else's: a parent can't touch Kid's, Kid can't touch Ann's", async () => {
    const e1 = await as(ann, "update event_comments set body = 'x' where id = $1 returning 1", [kidC]);
    const e2 = await as(kid, "update event_comments set body = 'x' where id = $1 returning 1", [annC]);
    const d1 = await as(ann, "delete from event_comments where id = $1 returning 1", [kidC]);
    const d2 = await as(abe, "delete from event_comments where id = $1 returning 1", [annC]);
    return [e1, e2, d1, d2].every((r) => r.length === 0) || [e1, e2, d1, d2];
  });
  await check("An edit can't move a comment to another event, author or time", async () => {
    const other = (await db.query("insert into events (family_id, title) values ($1, 'Lunch') returning id", [A])).rows[0].id;
    return (
      (await refused(() => as(ann, "update event_comments set event_id = $2 where id = $1", [annC, other]), "stays on its event")) === true &&
      (await refused(() => as(ann, "update event_comments set created_at = now() - interval '1 day' where id = $1", [annC]))) === true
    );
  });
  await check("Ann can't hand her comment to Abe", async () => refused(() => as(ann, "update event_comments set member_id = $2 where id = $1", [annC, abeM])));
  await check("Kid deletes his own", async () => (await as(kid, "delete from event_comments where id = $1 returning 1", [kidC])).length === 1);
  await check("Deleting the event takes the thread with it", async () => {
    await as(ann, "delete from events where id = $1", [ev]);
    return (await db.query("select 1 from event_comments where event_id = $1", [ev])).rows.length === 0;
  });
}
