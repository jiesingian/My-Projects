// Managed children count (20261021000500): with Baby A's status 'managed', as
// in the real schema, a grown-up answers Who's coming for her and puts her in
// the monito-monita, and the draw includes her; a child still cannot answer
// for her, another household cannot put her in, and a member who left stays out.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  const baby = P("a3");
  await db.query("update members set status = 'managed' where id = $1", [baby]);
  const today = "(select (now() at time zone 'Asia/Manila')::date)";
  const ev = (await db.query(`insert into events (family_id, title, event_date) values ($1, 'Reunion', ${today} + 3) returning id`, [A])).rows[0].id;
  const answer = (who, member, family = A) =>
    as(who, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', current_member_id()) returning member_id", [ev, member, family]);

  await check("A grown-up answers Going for a managed child", async () => (await answer(ann, baby)).length === 1);
  await check("A child with a login cannot answer for her; another household cannot either", async () => {
    await db.query("delete from event_rsvps where event_id = $1", [ev]);
    const k = await refused(() => answer(kid, baby));
    const b = await refused(() => answer(ben, baby, B));
    return (k === true && b === true) || { k, b };
  });

  const draw = (await as(ann, `insert into gift_draws (family_id, title, exchange_date, created_by) values ($1, 'Pasko', ${today} + 60, $2) returning id`, [A, P("a1")]))[0].id;
  const put = (who, member, family = A, by = P("a1")) =>
    as(who, "insert into gift_draw_people (draw_id, member_id, family_id, added_by) values ($1, $2, $3, $4) returning id", [draw, member, family, by]);

  await check("A grown-up puts a managed child in the draw", async () => (await put(ann, baby)).length === 1);
  await check("Another household cannot put her in", async () => refused(() => put(ben, baby, A, P("b1"))));
  await check("A member who left is still kept out", async () => {
    await db.query("update members set status = 'moved' where id = $1", [P("a4")]);
    const r = await refused(() => put(ann, P("a4")));
    await db.query("update members set status = 'active' where id = $1", [P("a4")]);
    return r;
  });
  await check("The draw counts her: three people, a loop through all of them", async () => {
    await put(ann, P("a1"));
    await put(ann, P("a4"));
    const n = (await as(ann, "select draw_gift_draw($1) as n", [draw]))[0].n;
    const picks = (await db.query("select count(*)::int as c from gift_draw_picks k join gift_draw_people p on p.id = k.giver_id where k.draw_id = $1 and p.member_id = $2", [draw, baby])).rows[0].c;
    return (n === 3 && picks === 1) || { n, picks };
  });
}
