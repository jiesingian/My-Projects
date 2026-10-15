// Suki and loyalty cards (20261015090000): the household's own, seen by
// everyone who can open the Buy list, written only by its grown-ups, never by
// a linked household, a stranger or a child, and never in someone else's name.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2");

  const add = (who, fields = {}) => {
    const f = { family: A, author: M("a1"), store: "SM Supermarket", number: "8000 1234 5678", ...fields };
    return as(
      who,
      "insert into loyalty_cards (family_id, store, card_name, card_number, note, created_by) values ($1, $2, 'SM Advantage', $3, 'Mama''s card', $4) returning id",
      [f.family, f.store, f.number, f.author],
    );
  };
  const sees = async (who, id) => (await as(who, "select 1 from loyalty_cards where id = $1", [id])).length === 1;
  const number = async (id) => (await db.query("select card_number from loyalty_cards where id = $1", [id])).rows[0]?.card_number;
  const left = async (id) => (await db.query("select count(*)::int as n from loyalty_cards where id = $1", [id])).rows[0].n === 1;

  let card;
  await check("A grown-up adds the household's SM Advantage card", async () => {
    card = (await add(ann))[0]?.id;
    return !!card;
  });
  await check("The other grown-up and the teen see it", async () => (await sees(abe, card)) && (await sees(kid, card)));
  await check("A linked household does not see it, sharing or not", async () => !(await sees(ben, card)) && !(await sees(cat, card)));
  await check("A stranger, grown-up or child, does not see it", async () => !(await sees(dan, card)) && !(await sees(dee, card)));
  await check("A child in kid view does not see it", async () => {
    await db.exec(`update members set kid_view = true where id = '${M("a2")}'`);
    const r = !(await sees(kid, card));
    await db.exec(`update members set kid_view = false where id = '${M("a2")}'`);
    return r;
  });

  await check("The other grown-up adds one too", async () => (await add(abe, { author: M("a4"), store: "Puregold" })).length === 1);
  await check("A teen cannot add a card", async () => refused(() => add(kid, { author: M("a2") })));
  await check("Nobody adds a card in someone else's name (forged created_by)", async () => refused(() => add(abe, { author: M("a1") })));
  await check("Nor with nobody's name on it", async () => refused(() => add(ann, { author: null })));
  await check("A linked household cannot add one to this household", async () => refused(() => add(ben, { author: M("b1") })));
  await check("A stranger cannot either", async () => refused(() => add(dan, { author: M("d1") })));
  await check("A blank number is refused", async () => refused(() => add(ann, { number: "   " })));

  await check("A grown-up may change a card someone else added", async () =>
    (await as(abe, "update loyalty_cards set card_number = '8000 9999 0000' where id = $1 returning id", [card])).length === 1);
  await check("Who added it stays as it was", async () => {
    await as(abe, "update loyalty_cards set created_by = $2 where id = $1", [card, M("a4")]);
    return (await db.query("select created_by from loyalty_cards where id = $1", [card])).rows[0].created_by === M("a1");
  });
  await check("A teen cannot change it", async () => {
    await as(kid, "update loyalty_cards set card_number = 'changed' where id = $1", [card]);
    return (await number(card)) === "8000 9999 0000";
  });
  await check("Nor a linked household", async () => {
    await as(ben, "update loyalty_cards set card_number = 'changed' where id = $1", [card]);
    return (await number(card)) === "8000 9999 0000";
  });
  await check("A grown-up cannot move it to another household", async () =>
    refused(() => as(ann, "update loyalty_cards set family_id = $2 where id = $1", [card, B])));

  await check("A teen cannot take it off", async () => {
    await as(kid, "delete from loyalty_cards where id = $1", [card]);
    return left(card);
  });
  await check("Nor a linked household, nor a stranger", async () => {
    await as(ben, "delete from loyalty_cards where id = $1", [card]);
    await as(dan, "delete from loyalty_cards where id = $1", [card]);
    return left(card);
  });
  await check("A grown-up takes it off", async () => {
    await as(abe, "delete from loyalty_cards where id = $1", [card]);
    return !(await left(card));
  });

  await check("The visibility helper is not callable by anon", async () =>
    refused(() => db.query("set role anon; select public.can_see_loyalty_cards();").finally(() => db.exec("reset role"))));
}
