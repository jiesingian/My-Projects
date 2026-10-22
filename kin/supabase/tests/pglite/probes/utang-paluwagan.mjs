// Utang and paluwagan (20261019110000): grown-ups only, "just me" is the
// recorder's alone (and so are its payments and members), children see
// nothing, nothing crosses households, and payments cannot overpay.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const annM = P("a1"), abeM = P("a4");

  const utang = (who, by, { family = A, priv = false, amount = 5000 } = {}) =>
    as(who, "insert into utang_entries (family_id, direction, person_name, amount, is_private, remind, recorded_by) values ($1, 'lent', 'Tita Baby', $2, $3, true, $4) returning id", [family, amount, priv, by]);
  const pay = (who, id, amount, by) =>
    as(who, "insert into utang_payments (utang_id, family_id, amount, recorded_by) values ($1, $2, $3, $4) returning id", [id, A, amount, by]);
  const group = (who, by, priv = false) =>
    as(who, "insert into paluwagan_groups (family_id, name, contribution, frequency, starts_on, is_private, recorded_by) values ($1, 'Barkada', 1000, 'monthly', '2026-10-01', $2, $3) returning id", [A, priv, by]);
  const member = (who, g, name, turn) =>
    as(who, "insert into paluwagan_members (group_id, family_id, name, turn) values ($1, $2, $3, $4) returning id", [g, A, name, turn]);

  let shared, mine, g, gMine, m1, m2;
  await check("Ann records a household utang and a just-me one", async () => {
    shared = (await utang(ann, annM))[0].id;
    mine = (await utang(ann, annM, { priv: true }))[0].id;
    return typeof shared === "string" && typeof mine === "string";
  });
  await check("Abe records a partial payment on the household one", async () => (await pay(abe, shared, 2000, abeM)).length === 1);
  await check("Payments cannot add up to more than the utang", async () => refused(() => pay(ann, shared, 3500, annM), "utang_overpaid"));
  await check("The rest can be paid", async () => (await pay(ann, shared, 3000, annM)).length === 1);

  await check("Abe sees the household utang and its payments", async () =>
    (await as(abe, "select 1 from utang_entries where id = $1", [shared])).length === 1 &&
    (await as(abe, "select 1 from utang_payments where utang_id = $1", [shared])).length === 2);
  await check("Abe sees neither Ann's just-me utang nor anything under it", async () => {
    await pay(ann, mine, 100, annM);
    return (await as(abe, "select 1 from utang_entries where id = $1", [mine])).length === 0 &&
      (await as(abe, "select 1 from utang_payments where utang_id = $1", [mine])).length === 0;
  });
  await check("Abe cannot pay into, edit or delete Ann's just-me utang", async () =>
    (await refused(() => pay(abe, mine, 10, abeM))) === true &&
    (await as(abe, "update utang_entries set amount = 1 where id = $1 returning 1", [mine])).length === 0 &&
    (await as(abe, "delete from utang_entries where id = $1 returning 1", [mine])).length === 0);
  await check("Abe cannot hide Ann's household utang as just-me", async () =>
    refused(() => as(abe, "update utang_entries set is_private = true where id = $1", [shared])));
  await check("Ann can make her own household utang just-me", async () =>
    (await as(ann, "update utang_entries set is_private = true where id = $1 returning 1", [shared])).length === 1 &&
    (await as(ann, "update utang_entries set is_private = false where id = $1 returning 1", [shared])).length === 1);
  await check("Nobody records in someone else's name", async () =>
    (await refused(() => utang(abe, annM))) === true && (await refused(() => pay(abe, shared, 1, annM))) === true);

  await check("Ann sets up a paluwagan with three members, one of them us", async () => {
    g = (await group(ann, annM))[0].id;
    m1 = (await member(ann, g, "Ate Joy", 1))[0].id;
    m2 = (await member(ann, g, "Us", 2))[0].id;
    await member(ann, g, "Kuya Ben", 3);
    return typeof m2 === "string";
  });
  await check("Two members cannot have the same turn", async () => refused(() => member(ann, g, "Tito", 2)));
  await check("Abe ticks Ate Joy's round 1; the same round cannot be ticked twice", async () =>
    (await as(abe, "insert into paluwagan_payments (member_id, round, group_id, family_id, recorded_by) values ($1, 1, $2, $3, $4) returning 1", [m1, g, A, abeM])).length === 1 &&
    (await refused(() => as(ann, "insert into paluwagan_payments (member_id, round, group_id, family_id, recorded_by) values ($1, 1, $2, $3, $4)", [m1, g, A, annM]))) === true);
  await check("A payment's member must be in its group", async () => {
    gMine = (await group(ann, annM, true))[0].id;
    return refused(() => as(ann, "insert into paluwagan_payments (member_id, round, group_id, family_id, recorded_by) values ($1, 2, $2, $3, $4)", [m1, gMine, A, annM]), "paluwagan_member_not_in_group");
  });
  await check("Abe does not see Ann's just-me paluwagan or add to it", async () => {
    const mm = (await member(ann, gMine, "Ninang", 1))[0].id;
    return (await as(abe, "select 1 from paluwagan_groups where id = $1", [gMine])).length === 0 &&
      (await as(abe, "select 1 from paluwagan_members where id = $1", [mm])).length === 0 &&
      (await refused(() => member(abe, gMine, "Sneak", 2))) === true;
  });

  await check("Kid sees nothing, household or not, and writes nothing", async () =>
    (await as(kid, "select 1 from utang_entries")).length === 0 &&
    (await as(kid, "select 1 from utang_payments")).length === 0 &&
    (await as(kid, "select 1 from paluwagan_groups")).length === 0 &&
    (await as(kid, "select 1 from paluwagan_members")).length === 0 &&
    (await as(kid, "select 1 from paluwagan_payments")).length === 0 &&
    (await refused(() => utang(kid, P("a2")))) === true &&
    (await refused(() => member(kid, g, "Kid", 9))) === true);
  await check("Ben (linked) and Dan (stranger) see nothing of House A's", async () =>
    (await as(ben, "select 1 from utang_entries")).length === 0 &&
    (await as(dan, "select 1 from paluwagan_groups")).length === 0 &&
    (await as(dan, "select 1 from paluwagan_members")).length === 0);
  await check("Dan cannot write into House A", async () =>
    (await refused(() => utang(dan, P("d1")))) === true &&
    (await refused(() => as(dan, "insert into paluwagan_members (group_id, family_id, name, turn) values ($1, $2, 'x', 9)", [g, D]))) === true &&
    (await refused(() => as(dan, "insert into utang_payments (utang_id, family_id, amount, recorded_by) values ($1, $2, 1, $3)", [shared, D, P("d1")]))) === true);
  await check("An utang can be agreed as instalments, all three set or none", async () => {
    const plan = (n, freq, first) =>
      as(ann, "insert into utang_entries (family_id, direction, person_name, amount, started_on, instalments, instalment_frequency, first_due_on, recorded_by) values ($1, 'lent', 'Tito Jun', 30000, '2026-10-01', $2, $3, $4, $5) returning id", [A, n, freq, first, annM]);
    return (await plan(6, "monthly", "2026-11-01")).length === 1 &&
      (await refused(() => plan(6, null, "2026-11-01"))) === true &&
      (await refused(() => plan(1, "monthly", "2026-11-01"))) === true &&
      (await refused(() => plan(6, "daily", "2026-11-01"))) === true &&
      (await refused(() => plan(6, "monthly", "2026-09-01"))) === true;
  });
  await check("Deleting the utang takes its payments with it", async () => {
    await as(ann, "delete from utang_entries where id = $1", [shared]);
    return (await as(ann, "select 1 from utang_payments where utang_id = $1", [shared])).length === 0;
  });
}
