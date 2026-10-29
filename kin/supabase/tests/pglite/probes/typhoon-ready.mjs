const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// Typhoon mode and the household's go-bag checklist (20261029150000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1"), dee = U("d2"), stranger = U("ff");
  const add = (who, family, label) => as(who, "insert into ready_items (family_id, label) values ($1, $2) returning id, created_by, done_by", [family, label]);
  const list = async (who) => (await as(who, "select label, done_by from ready_items order by label")).map((r) => `${r.label}|${r.done_by ?? ""}`);
  const mode = (who, on) => as(who, "select public.set_typhoon_mode($1) as since", [on]);
  const since = async (family) => (await db.query("select typhoon_mode_since from families where id = $1", [family])).rows[0].typhoon_mode_since;

  await check("Ann adds items; who added them is Ann, whatever the row says", async () => {
    await add(ann, A, "Water, 3 days");
    const [r] = await as(ann, "insert into ready_items (family_id, label, created_by, done_by) values ($1, 'Flashlight', $2, $2) returning created_by, done_by", [A, M("a2")]);
    return (r.created_by === M("a1") && r.done_by === null) || r;
  });
  await check("The child ticks one; the tick is stamped with the child, not a forged name", async () => {
    const [r] = await as(kid, "update ready_items set done_at = now(), done_by = $1 where label = 'Flashlight' returning done_by", [M("a1")]);
    return r?.done_by === M("a2") || r;
  });
  await check("Unticking clears who ticked it", async () => {
    const [r] = await as(ann, "update ready_items set done_at = null where label = 'Flashlight' returning done_by, done_at");
    return (r.done_by === null && r.done_at === null) || r;
  });
  await check("Another household sees none of A's items, and can't add, tick or delete them", async () => {
    const seen = await list(dan);
    await as(dan, "update ready_items set done_at = now()");
    await as(dan, "delete from ready_items");
    const left = (await db.query("select count(*)::int as n from ready_items where family_id = $1 and done_at is null", [A])).rows[0].n;
    const filed = await refused(() => add(dan, A, "Planted"));
    return (seen.length === 0 && left === 2 && filed === true) || { seen, left, filed };
  });
  await check("An item can't be moved to another household", async () => {
    const r = await as(ann, "update ready_items set family_id = $1 where label = 'Water, 3 days' returning family_id", [D]).then((x) => x, () => "refused");
    const fam = (await db.query("select family_id from ready_items where label = 'Water, 3 days'")).rows[0].family_id;
    return fam === A || { r, fam };
  });
  await check("A stranger and anon read nothing", async () => {
    const s = await list(stranger);
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from ready_items").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (s.length === 0 && anonRead === true) || { s, anonRead };
  });
  await check("A grown-up switches Typhoon mode on and off for their own household only", async () => {
    await mode(ann, true);
    const on = await since(A);
    const other = await since(D);
    await mode(ann, false);
    const off = await since(A);
    return (on !== null && other === null && off === null) || { on, other, off };
  });
  await check("A child can't switch it, here or anywhere", async () => {
    const a = await refused(() => mode(kid, true));
    const b = await refused(() => mode(dee, true));
    return (a === true && b === true && (await since(A)) === null && (await since(D)) === null) || { a, b };
  });
  await check("A stranger and anon can't switch it", async () => {
    const s = await refused(() => mode(stranger, true));
    const r = (await db.query("select has_function_privilege('anon', 'public.set_typhoon_mode(boolean)', 'execute') as a")).rows[0];
    return (s === true && r.a === false) || { s, r };
  });
  await check("Nobody calls ready_items_stamp() directly", async () => {
    const r = (await db.query("select has_function_privilege('authenticated', 'public.ready_items_stamp()', 'execute') as a")).rows[0];
    return r.a === false || r;
  });
}
