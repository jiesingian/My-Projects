// Potluck on an event (20261019170100): the host household lists what is
// needed; it and, when asked, linked households claim in their own names, up
// to what is wanted; strangers and unlinked households see nothing; a child
// in kid view cannot change the list; names cross on the row.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const today = "(select (now() at time zone 'Asia/Manila')::date)";
  const ev = async (family, offset = 3, extra = "") =>
    (await db.query(`insert into events (family_id, title, event_date${extra ? ", recurs_yearly" : ""}) values ($1, 'Undas reunion', ${today} + ${offset}${extra}) returning id`, [family])).rows[0].id;
  const party = await ev(A);
  const over = await ev(A, -2);
  const yearly = await ev(A, 3, ", true");
  const dans = await ev(D);

  const addItem = (who, event, label, wanted = 1, family = A, by = P("a1")) =>
    as(who, "insert into potluck_items (event_id, family_id, label, wanted, created_by) values ($1, $2, $3, $4, $5) returning id", [event, family, label, wanted, by]);
  const claim = (who, item, qty = 1, member = null, family = null) =>
    as(
      who,
      "insert into potluck_claims (item_id, event_id, event_family_id, member_id, family_id, qty) values ($1, $2, $3, coalesce($5, current_member_id()), coalesce($6, current_family_id()), $4) returning id, member_name, household_name, event_family_id",
      [item, party, A, qty, member, family],
    );
  const sees = async (who, item) => (await as(who, "select 1 from potluck_items where id = $1", [item])).length === 1;

  let pancit, ice;
  await check("A grown-up of the host household lists what is needed", async () => {
    pancit = (await addItem(ann, party, "Pancit", 2))[0]?.id;
    ice = (await addItem(abe, party, "Ice", 3, A, P("a4")))[0]?.id;
    return !!pancit && !!ice;
  });
  await check("Nobody lists in someone else's name", async () => refused(() => addItem(ann, party, "Lumpia", 1, A, P("a4"))));
  await check("Another household cannot list on this event, or put its list under its own", async () =>
    (await refused(() => addItem(ben, party, "Lumpia", 1, A, P("b1")))) === true && (await refused(() => addItem(ben, party, "Lumpia", 1, B, P("b1")))) === true);
  await check("A child in kid view cannot add to the list", async () => {
    await db.exec(`update members set kid_view = true where id = '${P("a2")}'`);
    const r = await refused(() => addItem(kid, party, "Chips", 1, A, P("a2")));
    await db.exec(`update members set kid_view = false where id = '${P("a2")}'`);
    return r;
  });

  await check("The household sees the list; a linked household does not until asked; a stranger never", async () =>
    (await sees(kid, pancit)) && !(await sees(ben, pancit)) && !(await sees(dan, pancit)));
  await check("The household claims, in its own name, with the name on the row", async () => {
    const r = (await claim(kid, pancit, 1))[0];
    return (r?.member_name === "Kid A" && r.household_name === "House A" && r.event_family_id === A) || r;
  });
  await check("A linked household cannot claim before the host asks relatives", async () => refused(() => claim(ben, ice, 1)));

  await db.query("update events set potluck_relatives = true where id = $1", [party]);
  await check("Asked: the linked household sees the list and the event's title, never the event row", async () => {
    const e = (await as(ben, "select title, host_name, mine, open from potluck_event($1)", [party]))[0];
    const row = await as(ben, "select 1 from events where id = $1", [party]);
    return ((await sees(ben, pancit)) && e?.title === "Undas reunion" && e.host_name === "House A" && e.mine === false && e.open === true && row.length === 0) || e;
  });
  await check("It is listed among relatives' potlucks for the linked household, not for the host", async () => {
    const theirs = await as(ben, "select event_id, open_items from relatives_potlucks()");
    const ours = await as(ann, "select event_id from relatives_potlucks()");
    return (theirs.length === 1 && theirs[0].event_id === party && theirs[0].open_items === 2 && ours.length === 0) || { theirs, ours };
  });
  await check("An unlinked stranger still sees nothing", async () => !(await sees(dan, pancit)) && (await as(dan, "select * from potluck_event($1)", [party])).length === 0);
  await check("The linked household claims in its own name", async () => {
    const r = (await claim(ben, ice, 2))[0];
    return (r?.member_name === "Ben B" && r.household_name === "House B") || r;
  });
  await check("Nobody claims for somebody else, or as another household", async () =>
    (await refused(() => claim(ben, pancit, 1, P("a1")))) === true && (await refused(() => claim(ben, pancit, 1, null, A))) === true);
  await check("No more than is wanted: one bag of ice left, two refused", async () => {
    const r = await refused(() => claim(abe, ice, 2));
    const ok = (await claim(abe, ice, 1)).length === 1;
    return (r === true && ok) || { r, ok };
  });
  await check("One claim each per item", async () => refused(() => claim(kid, pancit, 1)));
  await check("The list cannot ask for fewer than are claimed", async () => refused(() => as(ann, "update potluck_items set wanted = 1 where id = $1", [ice])));

  await check("A claimer changes their own count; not someone else's", async () => {
    const own = await as(ben, "update potluck_claims set qty = 1 where item_id = $1 and member_id = $2 returning qty", [ice, P("b1")]);
    const other = await as(ben, "update potluck_claims set qty = 1 where item_id = $1 and member_id = $2 returning qty", [pancit, P("a2")]);
    return (own.length === 1 && other.length === 0) || { own, other };
  });
  await check("A claim cannot be moved to another person", async () => refused(() => as(ben, "update potluck_claims set member_id = $2 where item_id = $1 and member_id = $3", [ice, P("a1"), P("b1")])));
  await check("A linked household cannot change or remove the host's list", async () => {
    await as(ben, "update potluck_items set label = 'Changed' where id = $1", [pancit]);
    await as(ben, "delete from potluck_items where id = $1", [pancit]);
    return (await db.query("select label from potluck_items where id = $1", [pancit])).rows[0]?.label === "Pancit";
  });
  await check("The host's grown-up may take a guest's claim off the list; a child may not", async () => {
    const byKid = await as(kid, "delete from potluck_claims where item_id = $1 and member_id = $2 returning 1", [ice, P("b1")]);
    const byAnn = await as(ann, "delete from potluck_claims where item_id = $1 and member_id = $2 returning 1", [ice, P("b1")]);
    return (byKid.length === 0 && byAnn.length === 1) || { byKid, byAnn };
  });
  await check("Turned back off: the linked household no longer sees it", async () => {
    await db.query("update events set potluck_relatives = false where id = $1", [party]);
    return !(await sees(ben, pancit)) && !(await sees(cat, pancit));
  });

  await check("Nothing is claimed on an event that is over, or a yearly one", async () => {
    const o = (await addItem(ann, over, "Rice"))[0].id;
    const y = (await addItem(ann, yearly, "Cake"))[0].id;
    return (await refused(() => claim(ann, o))) === true && (await refused(() => claim(ann, y))) === true;
  });
  await check("A list cannot hang on another household's event", async () => refused(() => addItem(ann, dans, "Rice")));
  await check("Removing an item takes its claims with it", async () => {
    await as(ann, "delete from potluck_items where id = $1", [pancit]);
    return (await db.query("select count(*)::int as n from potluck_claims where item_id = $1", [pancit])).rows[0].n === 0;
  });
}
