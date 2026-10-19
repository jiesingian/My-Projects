// Monito-monita (20261019233200): a grown-up starts a draw and asks linked
// households in; each household puts in only its own people; only the
// organizer household's grown-up draws; each person reads only their own pick
// (a grown-up also their managed child's), never anyone else's -- the
// organizer included; wish lists are read by their owner and whoever drew
// them; reveal on the day opens the picks to everyone in the draw.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const today = "(select (now() at time zone 'Asia/Manila')::date)";
  const start = (who, by, family = A) =>
    as(who, `insert into gift_draws (family_id, title, price_cap, exchange_date, not_own_household, created_by) values ($1, 'Pasko 2026', 500, ${today} + 60, true, $2) returning id`, [family, by]);
  const ask = (who, draw, family) => as(who, "insert into gift_draw_households (draw_id, family_id) values ($1, $2) returning household_name", [draw, family]);
  const put = (who, draw, member, family, by) =>
    as(who, "insert into gift_draw_people (draw_id, member_id, family_id, added_by) values ($1, $2, $3, $4) returning id, name, household_name", [draw, member, family, by]);
  const draw = (who, id) => as(who, "select draw_gift_draw($1) as n", [id]);
  const picks = (who, id) => as(who, "select giver_id, receiver_id from gift_draw_picks where draw_id = $1", [id]);
  const people = async (id) => (await db.query("select id, member_id, family_id from gift_draw_people where draw_id = $1", [id])).rows;

  let d;
  await check("A child cannot start a draw; a grown-up can", async () => {
    const r = await refused(() => start(kid, P("a2")));
    d = (await start(ann, P("a1")))[0]?.id;
    return r === true && !!d;
  });
  await check("Nobody starts one in someone else's name", async () => refused(() => start(ann, P("a4"))));
  await check("Linked households can be asked in, with their name on the row; a stranger cannot", async () => {
    const b = (await ask(ann, d, B))[0]?.household_name;
    const c = (await ask(ann, d, C))[0]?.household_name;
    return b === "House B" && c === "House C" && (await refused(() => ask(ann, d, D)));
  });
  await check("Only the organizer's grown-ups ask households in", async () => refused(() => ask(ben, d, C)));
  await check("Asked households see the draw; a stranger does not", async () =>
    (await as(ben, "select 1 from gift_draws where id = $1", [d])).length === 1 && (await as(dan, "select 1 from gift_draws where id = $1", [d])).length === 0);

  let annP, abeP, kidP, babyP, benP, catP;
  await check("A grown-up puts in their own household, a managed child too; names travel on the row", async () => {
    annP = (await put(ann, d, P("a1"), A, P("a1")))[0];
    abeP = (await put(ann, d, P("a4"), A, P("a1")))[0];
    babyP = (await put(ann, d, P("a3"), A, P("a1")))[0];
    return annP?.name === "Ann A" && annP.household_name === "House A" && !!abeP && !!babyP;
  });
  await check("A teen puts only themselves in", async () => {
    const other = await refused(() => put(kid, d, P("a4"), A, P("a2")));
    kidP = (await put(kid, d, P("a2"), A, P("a2")))[0];
    return other === true && !!kidP;
  });
  await check("Each household only its own people: Ben cannot put Ann in, nor a stranger themselves", async () =>
    (await refused(() => put(ben, d, P("a1"), A, P("b1")))) === true && (await refused(() => put(dan, d, P("d1"), D, P("d1")))) === true);
  await check("Linked households put their own in", async () => {
    benP = (await put(ben, d, P("b1"), B, P("b1")))[0];
    catP = (await put(cat, d, P("c1"), C, P("c1")))[0];
    return benP?.household_name === "House B" && !!catP;
  });

  await check("Only the organizer household's grown-up draws", async () =>
    (await refused(() => draw(ben, d))) === true && (await refused(() => draw(kid, d))) === true);
  await check("Not their own household: refused while one household is more than half (4 of 6)", async () => refused(() => draw(ann, d)));
  await db.query("delete from gift_draw_people where id = any($1)", [[kidP.id, babyP.id]]);
  await db.query("insert into gift_draw_people (draw_id, member_id, family_id, added_by) values ($1, $2, $3, $2)", [d, P("a3"), A]);
  const babyId = (await db.query("select id from gift_draw_people where draw_id = $1 and member_id = $2", [d, P("a3")])).rows[0].id;
  await db.query("delete from gift_draw_people where id = $1", [abeP.id]);
  await check("Two of four from one household: drawn, nobody their own household, nobody themselves, one loop", async () => {
    for (let round = 0; round < 15; round++) {
      const n = (await draw(ann, d))[0]?.n;
      const all = (await db.query("select giver_id, receiver_id from gift_draw_picks where draw_id = $1", [d])).rows;
      const fam = new Map((await people(d)).map((p) => [p.id, p.family_id]));
      if (n !== 4 || all.length !== 4) return { n, all };
      if (all.some((k) => k.giver_id === k.receiver_id || fam.get(k.giver_id) === fam.get(k.receiver_id))) return all;
      const next = new Map(all.map((k) => [k.giver_id, k.receiver_id]));
      let at = all[0].giver_id, steps = 0;
      do { at = next.get(at); steps++; } while (at !== all[0].giver_id && steps < 10);
      if (steps !== 4) return { loop: steps };
    }
    return true;
  });
  await check("Each person reads only their own pick: Ben one, Cat one", async () =>
    (await picks(ben, d)).length === 1 && (await picks(ben, d))[0].giver_id === benP.id && (await picks(cat, d)).length === 1);
  await check("The organizer reads her own and her managed child's, nobody else's", async () => {
    const mine = (await picks(ann, d)).map((k) => k.giver_id).sort();
    return JSON.stringify(mine) === JSON.stringify([annP.id, babyId].sort()) || mine;
  });
  await check("A teen in the household reads no one's; a stranger none", async () => (await picks(kid, d)).length === 0 && (await picks(dan, d)).length === 0);
  await check("Nobody writes a pick by hand", async () => refused(() => as(ann, "insert into gift_draw_picks (draw_id, giver_id, receiver_id) values ($1, $2, $3)", [d, annP.id, benP.id])));
  await check("After the draw, nobody is added", async () => refused(() => put(ann, d, P("a4"), A, P("a1"))));
  await check("drawn_at cannot be cleared by hand", async () => {
    await as(ann, "update gift_draws set drawn_at = null where id = $1", [d]);
    return (await db.query("select drawn_at from gift_draws where id = $1", [d])).rows[0].drawn_at !== null;
  });

  let wish;
  await check("Ben keeps a wish list; Ann cannot write on it", async () => {
    wish = (await as(ben, "insert into gift_draw_wishes (draw_id, person_id, body) values ($1, $2, 'Anything Jollibee') returning id", [d, benP.id]))[0]?.id;
    return !!wish && (await refused(() => as(ann, "insert into gift_draw_wishes (draw_id, person_id, body) values ($1, $2, 'Socks')", [d, benP.id])));
  });
  await check("Whoever drew Ben reads his list; nobody else does", async () => {
    const drewBen = (await db.query("select g.member_id from gift_draw_picks k join gift_draw_people g on g.id = k.giver_id where k.receiver_id = $1", [benP.id])).rows[0].member_id;
    const login = { [P("a1")]: ann, [P("c1")]: cat, [P("a3")]: ann }[drewBen];
    const others = [ann, cat, kid, dan].filter((u) => u !== login && !(drewBen === P("a3") && u === ann));
    const seen = (await as(login, "select 1 from gift_draw_wishes where id = $1", [wish])).length === 1;
    const leaked = [];
    for (const u of others) if ((await as(u, "select 1 from gift_draw_wishes where id = $1", [wish])).length) leaked.push(u);
    return (seen && leaked.length === 0) || { seen, leaked };
  });
  await check("A grown-up keeps a wish list for her managed child", async () =>
    (await as(ann, "insert into gift_draw_wishes (draw_id, person_id, body) values ($1, $2, 'Crayons') returning id", [d, babyId])).length === 1);

  await check("Reveal on the day: before it, the picks stay private", async () => {
    await db.query("update gift_draws set reveal_on_day = true where id = $1", [d]);
    return (await picks(ben, d)).length === 1;
  });
  await check("On the day, everyone in the draw sees who picked whom; a stranger still does not", async () => {
    await db.query(`update gift_draws set exchange_date = ${today} where id = $1`, [d]);
    return (await picks(ben, d)).length === 4 && (await picks(dan, d)).length === 0;
  });

  await check("Before a draw, a household that leaves takes its people with it", async () => {
    const d2 = (await start(ann, P("a1")))[0].id;
    await ask(ann, d2, B);
    await put(ben, d2, P("b1"), B, P("b1"));
    await as(ben, "delete from gift_draw_households where draw_id = $1 and family_id = $2", [d2, B]);
    const left = (await db.query("select count(*)::int as n from gift_draw_people where draw_id = $1", [d2])).rows[0].n;
    return left === 0 && (await as(ben, "select 1 from gift_draws where id = $1", [d2])).length === 0;
  });
  await check("Without the household rule, three people from one household are drawn too", async () => {
    const d3 = (await db.query(`insert into gift_draws (family_id, exchange_date, created_by) values ($1, ${today} + 5, $2) returning id`, [A, P("a1")])).rows[0].id;
    for (const m of ["a1", "a3", "a4"]) await db.query("insert into gift_draw_people (draw_id, member_id, family_id) values ($1, $2, $3)", [d3, P(m), A]);
    return (await draw(ann, d3))[0]?.n === 3;
  });
  await check("Fewer than three cannot be drawn", async () => {
    const d4 = (await db.query(`insert into gift_draws (family_id, exchange_date, created_by) values ($1, ${today} + 5, $2) returning id`, [A, P("a1")])).rows[0].id;
    await db.query("insert into gift_draw_people (draw_id, member_id, family_id) values ($1, $2, $3), ($1, $4, $3)", [d4, P("a1"), A, P("a4")]);
    return refused(() => draw(ann, d4));
  });
}
