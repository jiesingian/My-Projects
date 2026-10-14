const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const hash = (c) => c.repeat(43);
// "Hey Siri, add rice to Kin": the private add-to-list link (20261014202000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), stranger = U("ff");
  // The Shortcut has no session: it calls as anon.
  const anon = async (sql, params = []) => {
    await db.exec("set role anon");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const add = (h, items) => anon("select public.add_to_list_by_link($1, $2::jsonb) as n", [h, JSON.stringify(items)]).then((r) => r[0].n);
  const listOf = async (fam) => (await db.query("select name, quantity, unit, section, created_by from buy_items where family_id = $1 order by name", [fam])).rows;

  await check("Ann makes her link, and it adds to her household's list as her", async () => {
    await as(ann, "select public.set_list_add_token($1)", [hash("a")]);
    const n = await add(hash("a"), [{ name: "Rice", quantity: 2, unit: "kg", section: "Rice & Grains" }, { name: "Eggs", section: "Dairy & Eggs" }]);
    const rows = await listOf(A);
    return (n === 2 && rows.length === 2 && rows.every((r) => r.created_by === M("a1")) && rows[1].unit === "kg") || { n, rows };
  });
  await check("Lists are Kin Free: it still adds with no Plus", async () => {
    await db.exec("create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select false $$");
    return (await add(hash("a"), [{ name: "Milk" }])) === 1;
  });
  await check("An unknown key, a malformed one and an empty one all get -1", async () => {
    const r = [await add(hash("z"), [{ name: "Ice" }]), await add("short", [{ name: "Ice" }]), await add(hash("a") + "x", [{ name: "Ice" }]), await add(null, [{ name: "Ice" }])];
    return r.every((n) => n === -1) || r;
  });
  await check("Nobody reads the keys, signed in or not", async () => {
    const a = await refused(() => anon("select * from list_add_tokens"));
    const b = await refused(() => as(ann, "select * from list_add_tokens"));
    const c = await refused(() => as(ann, "update list_add_tokens set family_id = $1", [B]));
    return (a === true && b === true && c === true) || { a, b, c };
  });
  await check("Ben's link adds to Ben's list, never Ann's, whatever the items say", async () => {
    await as(ben, "select public.set_list_add_token($1)", [hash("b")]);
    const before = (await listOf(A)).length;
    await add(hash("b"), [{ name: "Ice", family_id: A, created_by: M("a1") }]);
    const mine = await listOf(B);
    return ((await listOf(A)).length === before && mine.length === 1 && mine[0].created_by === M("b1")) || { mine };
  });
  await check("A child with a login can make one, as they can add in the app", async () => {
    await as(kid, "select public.set_list_add_token($1)", [hash("k")]);
    const n = await add(hash("k"), [{ name: "Chocolate" }]);
    const r = (await db.query("select created_by from buy_items where name = 'Chocolate'")).rows;
    return (n === 1 && r[0].created_by === M("a2")) || { n, r };
  });
  await check("Someone signed in with no household can't make one, and anon can't at all", async () => {
    const s = await refused(() => as(stranger, "select public.set_list_add_token($1)", [hash("s")]), "Sign in");
    const a = await refused(() => anon("select public.set_list_add_token($1)", [hash("t")]));
    const n = (await db.query("select count(*)::int as n from list_add_tokens")).rows[0].n;
    return (s === true && a === true && n === 3) || { s, a, n };
  });
  await check("A badly shaped hash is refused when making a link", async () =>
    (await refused(() => as(ann, "select public.set_list_add_token('not-a-hash')"), "shape")) === true);
  await check("Making a new link replaces the old one, which stops working", async () => {
    await as(ann, "select public.set_list_add_token($1)", [hash("c")]);
    const old = await add(hash("a"), [{ name: "Salt" }]);
    const fresh = await add(hash("c"), [{ name: "Salt" }]);
    return (old === -1 && fresh === 1) || { old, fresh };
  });
  await check("Each member only turns off their own link", async () => {
    await as(ann, "select public.clear_list_add_token()");
    const annOn = (await as(ann, "select public.list_add_link_on() as on"))[0].on;
    const benOn = (await as(ben, "select public.list_add_link_on() as on"))[0].on;
    const revoked = await add(hash("c"), [{ name: "Sugar" }]);
    return (annOn === false && benOn === true && revoked === -1) || { annOn, benOn, revoked };
  });
  await check("More than 20 items, or not a list, adds nothing", async () => {
    const before = (await listOf(B)).length;
    const many = await add(hash("b"), Array.from({ length: 21 }, (_, i) => ({ name: `Thing ${i}` })));
    const notList = await add(hash("b"), { name: "Rice" });
    return (many === 0 && notList === 0 && (await listOf(B)).length === before) || { many, notList };
  });
  await check("Empty and over-long names are skipped; silly quantities and units dropped", async () => {
    const n = await add(hash("b"), [{ name: "   " }, { name: "x".repeat(151) }, { name: "Water", quantity: -3, unit: "L" }, { name: "Flour", quantity: 1, unit: "y".repeat(21), section: "z".repeat(41) }]);
    const w = (await db.query("select quantity, unit from buy_items where name = 'Water'")).rows[0];
    const f = (await db.query("select quantity, unit, section from buy_items where name = 'Flour'")).rows[0];
    return (n === 2 && w.quantity === null && w.unit === null && f.unit === null && f.section === "Other") || { n, w, f };
  });
  await check("A member who leaves, or moves household, finds the link stops working", async () => {
    await db.query("update members set status = 'left' where id = $1", [M("b1")]);
    const left = await add(hash("b"), [{ name: "Ice" }]);
    await db.query("update members set family_id = $1 where id = $2", [B, M("a2")]);
    const moved = await add(hash("k"), [{ name: "Ice" }]);
    return (left === -1 && moved === -1) || { left, moved };
  });

  // Reviewer's attacks (14 October), on households C and D, untouched above.
  const C = "c0000000-0000-0000-0000-000000000000", D = "d0000000-0000-0000-0000-000000000000";
  const cat = U("c1"), dan = U("d1"), dee = U("d2");
  await check("Nobody writes the keys except through the functions, and anon can't ask or clear", async () => {
    const ins = await refused(() => as(cat, "insert into list_add_tokens (member_id, family_id, token_hash) values ($1, $2, $3)", [M("d1"), D, hash("q")]));
    const del = await refused(() => as(cat, "delete from list_add_tokens"));
    const on = await refused(() => anon("select public.list_add_link_on()"));
    const clr = await refused(() => anon("select public.clear_list_add_token()"));
    return (ins === true && del === true && on === true && clr === true) || { ins, del, on, clr };
  });
  await check("Someone else's key can't be taken over by setting the same hash", async () => {
    await as(dan, "select public.set_list_add_token($1)", [hash("d")]);
    const took = await refused(() => as(cat, "select public.set_list_add_token($1)", [hash("d")]));
    const n = await add(hash("d"), [{ name: "Garlic" }]);
    const rows = await listOf(D);
    return (took === true && n === 1 && rows.length === 1 && rows[0].created_by === M("d1") && (await listOf(C)).length === 0) || { took, n, rows };
  });
  await check("Called signed in from another household, the link still adds only as its owner", async () => {
    const n = (await as(cat, "select public.add_to_list_by_link($1, $2::jsonb) as n", [hash("d"), JSON.stringify([{ name: "Onion", family_id: C }])]))[0].n;
    const onion = (await db.query("select family_id, created_by from buy_items where name = 'Onion'")).rows;
    return (n === 1 && onion.length === 1 && onion[0].family_id === D && onion[0].created_by === M("d1")) || { n, onion };
  });
  await check("Odd entries are skipped and odd quantities dropped, without an error", async () => {
    const n = await add(hash("d"), ["Rice", null, [1], { name: "Tuna", quantity: "lots", unit: "can" }, { name: "Soy", quantity: "NaN", unit: "L" }]);
    const r = (await db.query("select name, quantity, unit from buy_items where name in ('Tuna', 'Soy') order by name")).rows;
    return (n === 2 && r.length === 2 && r.every((x) => x.quantity === null && x.unit === null)) || { n, r };
  });
  await check("A send over 8,000 characters adds nothing", async () => {
    const before = (await listOf(D)).length;
    const n = await add(hash("d"), [{ name: "Salt", note: "z".repeat(8001) }]);
    return (n === 0 && (await listOf(D)).length === before) || { n };
  });
  await check("A member whose login is taken away finds the link stops working", async () => {
    await as(dee, "select public.set_list_add_token($1)", [hash("e")]);
    const before = await add(hash("e"), [{ name: "Juice" }]);
    await db.query("update members set auth_user_id = null where id = $1", [M("d2")]);
    const after = await add(hash("e"), [{ name: "Juice" }]);
    return (before === 1 && after === -1) || { before, after };
  });
}
