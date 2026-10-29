const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// A household's pets (20261029170000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1"), stranger = U("ff");
  const add = (who, family, name, extra = {}) =>
    as(who, "insert into pets (family_id, name, kind, created_by) values ($1, $2, $3, $4) returning id, created_by", [family, name, extra.kind ?? "dog", extra.by ?? null]);
  const names = async (who) => (await as(who, "select name from pets order by name")).map((r) => r.name);

  await check("Ann adds a pet; who added it is Ann, whatever the row says", async () => {
    const [r] = await add(ann, A, "Bantay", { by: M("a2") });
    return r.created_by === M("a1") || r;
  });
  await check("The child adds one and updates the vet visit", async () => {
    await add(kid, A, "Mingming", { kind: "cat" });
    const [r] = await as(kid, "update pets set next_vet_on = '2026-11-05' where name = 'Bantay' returning next_vet_on");
    return !!r || r;
  });
  await check("Another household sees none, and can't add, change or delete them", async () => {
    const seen = await names(dan);
    await as(dan, "update pets set name = 'Taken'");
    await as(dan, "delete from pets");
    const filed = await refused(() => add(dan, A, "Planted"));
    const left = await names(ann);
    return (seen.length === 0 && filed === true && left.join() === "Bantay,Mingming") || { seen, filed, left };
  });
  await check("A pet can't be moved to another household", async () => {
    await as(ann, "update pets set family_id = $1 where name = 'Bantay'", [D]).catch(() => null);
    const fam = (await db.query("select family_id from pets where name = 'Bantay'")).rows[0].family_id;
    return fam === A || fam;
  });
  await check("Only the listed kinds are accepted", async () => (await refused(() => add(ann, A, "Nemo", { kind: "dragon" }))) === true);
  await check("A stranger and anon read nothing", async () => {
    const s = await names(stranger);
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from pets").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (s.length === 0 && anonRead === true) || { s, anonRead };
  });
  await check("Nobody calls pets_stamp() directly", async () => {
    const r = (await db.query("select has_function_privilege('authenticated', 'public.pets_stamp()', 'execute') as a")).rows[0];
    return r.a === false || r;
  });
}
