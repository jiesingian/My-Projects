// Shared costs between linked households (20261019153000): only grown-ups
// of households in the pot see it, only while still linked; a pot needs
// every pair of its households linked; entries are written as yourself,
// from your own household, and taken back only by that household.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const make = (who, families, title = "Lola's medicines") => as(who, "select create_shared_pot($1, null, $2::uuid[]) id", [title, families]);
  const pots = async (who) => (await as(who, "select id from shared_pots")).map((r) => r.id);

  let pot;
  await check("Ann starts a pot with House B", async () => {
    pot = (await make(ann, [B]))[0].id;
    return !!pot;
  });
  await check("Both households are in it, by name, half each", async () => {
    const rows = await as(ben, "select family_name, share from shared_pot_households where pot_id = $1 order by family_name", [pot]);
    return JSON.stringify(rows.map((r) => [r.family_name, Number(r.share)])) === JSON.stringify([["House A", 1], ["House B", 1]]) || rows;
  });
  await check("Ann, Abe and Ben see it", async () => (await pots(ann)).includes(pot) && (await pots(abe)).includes(pot) && (await pots(ben)).includes(pot));
  await check("A child of House A sees nothing", async () => (await pots(kid)).length === 0 && (await as(kid, "select 1 from shared_pot_households")).length === 0);
  await check("Cat (linked to A, not in the pot) and Dan (a stranger) see nothing", async () => (await pots(cat)).length === 0 && (await pots(dan)).length === 0);
  await check("A child cannot start a pot", async () => refused(() => make(kid, [B]), "shared_pot_grown_up"));
  await check("A pot needs every pair linked: A, B and C refused (B and C are not)", async () => refused(() => make(ann, [B, C]), "shared_pot_linked"));
  await check("A pot with a household not linked to us is refused", async () => refused(() => make(ann, [D]), "shared_pot_linked"));
  await check("A pot of one household is refused", async () => refused(() => make(ann, []), "shared_pot_households"));

  const add = (who, family, member, extra = {}) =>
    as(who, "insert into shared_pot_entries (pot_id, kind, family_id, to_family_id, amount, description, member_id) values ($1, $2, $3, $4, $5, $6, $7) returning id, author_name", [
      pot, extra.kind ?? "cost", family, extra.to ?? null, extra.amount ?? 3000, extra.description ?? "Maintenance", member,
    ]);
  let benCost;
  await check("Ben records a cost; his name travels on it", async () => {
    const r = (await add(ben, B, "00000000-0000-0000-0000-0000000000b1"))[0];
    benCost = r.id;
    return r.author_name === "Ben B" || r;
  });
  await check("Ann sees Ben's cost", async () => (await as(ann, "select 1 from shared_pot_entries where id = $1", [benCost])).length === 1);
  await check("Ben cannot record as House A", async () => refused(() => add(ben, A, "00000000-0000-0000-0000-0000000000b1"), "row-level security"));
  await check("Ben cannot record as Ann", async () => refused(() => add(ben, B, "00000000-0000-0000-0000-0000000000a1"), "row-level security"));
  await check("A child cannot record", async () => refused(() => add(kid, A, "00000000-0000-0000-0000-0000000000a2"), "row-level security"));
  await check("Cat cannot record into a pot she is not in", async () => refused(() => add(cat, C, "00000000-0000-0000-0000-0000000000c1"), "row-level security"));
  await check("Ann records a payment to House B", async () => (await add(ann, A, "00000000-0000-0000-0000-0000000000a1", { kind: "payment", to: B, amount: 1500 })).length === 1);
  await check("A payment to a household outside the pot is refused", async () => refused(() => add(ann, A, "00000000-0000-0000-0000-0000000000a1", { kind: "payment", to: C }), "row-level security"));
  await check("A payment to yourself is refused", async () => refused(() => add(ann, A, "00000000-0000-0000-0000-0000000000a1", { kind: "payment", to: A }), "shared_pot_entries_payment_to"));
  await check("Ann cannot take back Ben's cost", async () => {
    await as(ann, "delete from shared_pot_entries where id = $1", [benCost]);
    return Number((await db.query(`select count(*) n from shared_pot_entries where id = '${benCost}'`)).rows[0].n) === 1;
  });
  await check("Ann cannot delete the pot once Ben has recorded in it", async () => {
    await as(ann, "delete from shared_pots where id = $1", [pot]);
    return Number((await db.query(`select count(*) n from shared_pots where id = '${pot}'`)).rows[0].n) === 1;
  });
  await check("Ben changes House A's share to 2", async () => {
    await as(ben, "select set_shared_pot_share($1, $2, 2)", [pot, A]);
    return Number((await db.query(`select share from shared_pot_households where pot_id = '${pot}' and family_id = '${A}'`)).rows[0].share) === 2;
  });
  await check("Cat cannot change a share", async () => refused(() => as(cat, "select set_shared_pot_share($1, $2, 5)", [pot, A]), "shared_pot_open"));
  await check("Households cannot be added or renamed by hand", async () => {
    const ins = await refused(() => as(ann, "insert into shared_pot_households (pot_id, family_id, family_name) values ($1, $2, 'Mine')", [pot, C]), "row-level security");
    await as(ann, "update shared_pot_households set family_name = 'Renamed' where pot_id = $1", [pot]);
    const names = (await db.query(`select family_name from shared_pot_households where pot_id = '${pot}' order by 1`)).rows.map((r) => r.family_name);
    return (ins === true && names.join() === "House A,House B") || [ins, names];
  });
  await check("Ben takes back his own cost", async () => {
    await as(ben, "delete from shared_pot_entries where id = $1", [benCost]);
    return Number((await db.query(`select count(*) n from shared_pot_entries where id = '${benCost}'`)).rows[0].n) === 0;
  });
  await check("Revoking the A-B link hides the pot from both at once", async () => {
    await db.exec(`update family_links set status = 'revoked' where requester_family_id = '${A}' and addressee_family_id = '${B}'`);
    return (await pots(ann)).length === 0 && (await pots(ben)).length === 0 && (await as(ben, "select 1 from shared_pot_entries")).length === 0;
  });
  await check("A pot with only House A's own entries can be deleted by House A", async () => {
    await db.exec(`update family_links set status = 'accepted' where requester_family_id = '${A}' and addressee_family_id = '${B}'`);
    const fresh = (await make(ann, [C], "Caregiver"))[0].id;
    await add(ann, A, "00000000-0000-0000-0000-0000000000a1").catch(() => null);
    await as(ann, "delete from shared_pots where id = $1", [fresh]);
    return Number((await db.query(`select count(*) n from shared_pots where id = '${fresh}'`)).rows[0].n) === 0;
  });
}
