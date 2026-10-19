// Christmas gifts and aguinaldo (20261019170300): the household's grown-ups
// keep the list; children never see it; the person a row is for never sees
// it or its ideas, a grown-up included; other households see nothing; and a
// bought gift can be recorded in Wealth under its own source.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const addPerson = (who, name, member = null, by = P("a1"), family = A) =>
    as(who, "insert into gift_list_people (family_id, year, name, member_id, kind, budget, created_by) values ($1, 2026, $2, $3, 'family', 1500, $4) returning id", [family, name, member, by]);
  const addItem = (who, person, label, by = P("a1"), cost = 500) =>
    as(who, "insert into gift_list_items (family_id, person_id, label, cost, created_by) values ($1, $2, $3, $4, $5) returning id, bought_at", [A, person, label, cost, by]);
  const sees = async (who, table, id) => (await as(who, `select 1 from ${table} where id = $1`, [id])).length === 1;

  let forKid, forAbe, inaanak, toy, shirt;
  await check("A grown-up lists people: a child at home, another grown-up, an inaanak", async () => {
    forKid = (await addPerson(ann, "Mia", P("a2")))[0]?.id;
    forAbe = (await addPerson(ann, "Abe", P("a4")))[0]?.id;
    inaanak = (await addPerson(ann, "Joshua (inaanak)"))[0]?.id;
    return !!forKid && !!forAbe && !!inaanak;
  });
  await check("Nobody lists themselves, or in another's name", async () =>
    (await refused(() => addPerson(ann, "Me", P("a1")))) === true && (await refused(() => addPerson(ann, "X", null, P("a4")))) === true);
  await check("A child cannot list anyone", async () => refused(() => addPerson(kid, "Lola", null, P("a2"))));
  await check("Nor point a row at another household's member, or into another household", async () =>
    (await refused(() => addPerson(ann, "Ben", P("b1")))) === true && (await refused(() => addPerson(ann, "Ben", null, P("a1"), B))) === true);

  await check("Ideas go on a person; bought gets its time", async () => {
    toy = (await addItem(ann, forKid, "Lego set"))[0]?.id;
    shirt = (await addItem(ann, forAbe, "Polo shirt"))[0]?.id;
    const t = await as(ann, "update gift_list_items set bought = true where id = $1 returning bought_at", [toy]);
    return !!t[0]?.bought_at && !!shirt;
  });
  await check("The child the gift is for sees neither the row nor the idea", async () => !(await sees(kid, "gift_list_people", forKid)) && !(await sees(kid, "gift_list_items", toy)));
  await check("A child sees none of the list at all", async () => (await as(kid, "select 1 from gift_list_people")).length === 0);
  await check("The grown-up it is for (Abe) sees neither his row nor its ideas, but sees the rest", async () =>
    !(await sees(abe, "gift_list_people", forAbe)) && !(await sees(abe, "gift_list_items", shirt)) && (await sees(abe, "gift_list_people", forKid)) && (await sees(abe, "gift_list_items", toy)));
  await check("Abe cannot add, change or remove ideas on his own row", async () => {
    const add = await refused(() => addItem(abe, forAbe, "Peek", P("a4")));
    await as(abe, "update gift_list_items set label = 'Changed' where id = $1", [shirt]);
    await as(abe, "delete from gift_list_items where id = $1", [shirt]);
    return add === true && (await db.query("select label from gift_list_items where id = $1", [shirt])).rows[0]?.label === "Polo shirt";
  });
  await check("Nor take himself off the list, or move a row to himself", async () => {
    await as(abe, "delete from gift_list_people where id = $1", [forAbe]);
    const moved = await refused(() => as(abe, "update gift_list_people set member_id = $2 where id = $1", [inaanak, P("a4")]));
    return moved === true && (await db.query("select 1 from gift_list_people where id = $1", [forAbe])).rows.length === 1;
  });
  await check("Abe adds to the inaanak's list", async () => (await addItem(abe, inaanak, "Aguinaldo", P("a4"), 200)).length === 1);
  await check("Other households, linked or not, see nothing", async () =>
    !(await sees(ben, "gift_list_people", forKid)) && !(await sees(ben, "gift_list_items", toy)) && !(await sees(dan, "gift_list_items", toy)));
  await check("An idea cannot hang on another household's person", async () => {
    const bens = (await addPerson(ben, "Ben's inaanak", null, P("b1"), B))[0].id;
    return refused(() => addItem(ann, bens, "Sneaky"));
  });
  await check("Ticking it bought again keeps its time; unticking clears it", async () => {
    const before = (await db.query("select bought_at from gift_list_items where id = $1", [toy])).rows[0].bought_at;
    await as(ann, "update gift_list_items set label = 'Lego city' where id = $1", [toy]);
    const kept = (await db.query("select bought_at from gift_list_items where id = $1", [toy])).rows[0].bought_at;
    await as(ann, "update gift_list_items set bought = false where id = $1", [toy]);
    const cleared = (await db.query("select bought_at from gift_list_items where id = $1", [toy])).rows[0].bought_at;
    return (String(before) === String(kept) && cleared === null) || { before, kept, cleared };
  });
  await check("Removing a person takes their ideas with them", async () => {
    await as(ann, "delete from gift_list_people where id = $1", [forKid]);
    return (await db.query("select count(*)::int as n from gift_list_items where id = $1", [toy])).rows[0].n === 0;
  });
  await check("Wealth takes a spend recorded against a gift", async () => {
    await db.exec(`insert into accounts (id, family_id, name) values ('ac000000-0000-0000-0000-000000000001', '${A}', 'Cash') on conflict do nothing`);
    await db.query("insert into wealth_transactions (family_id, account_id, direction, amount, particulars, category, source_table, source_id) values ($1, 'ac000000-0000-0000-0000-000000000001', 'out', 200, 'Aguinaldo', 'Gifts', 'gift_list_items', gen_random_uuid())", [A]);
    return true;
  });
}
