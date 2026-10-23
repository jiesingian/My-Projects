// Which store a line is bought at (20261023100000): a kind of store guessed
// when nobody chose one, a store name kept tidy, and both staying inside the
// household like the rest of the line.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const BEN = "10000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const add = (name, section, extra = "") =>
    as(ANN, `insert into buy_items (family_id, name, section${extra ? ", store_kind, store_name" : ""}) values ($1, $2, $3${extra}) returning store_kind, store_name`, [A, name, section]);

  await check("A line added with no store gets the app's guess", async () => {
    const fish = await add("Bangus", "Fish & Seafood");
    const nappies = await add("Diapers", "Baby");
    const soap = await add("Shampoo", "Personal Care");
    const rice = await add("Rice", "Rice & Grains");
    const got = [fish, nappies, soap, rice].map((r) => r[0].store_kind);
    return got.join() === "market,baby,pharmacy,grocery" || { got };
  });
  await check("A medicine's refill is for the pharmacy, whatever its section", async () => {
    const [med] = (await db.query(`insert into health_medicines (family_id, name) values ('${A}', 'Losartan') returning id`)).rows;
    const r = await as(ANN, "insert into buy_items (family_id, name, section, medicine_id) values ($1, 'Losartan', 'Other', $2) returning store_kind", [A, med.id]);
    return r[0].store_kind === "pharmacy" || { r };
  });
  await check("A chosen kind and name are kept, the name tidied", async () => {
    const r = await add("Notebook", "Other", ", 'bookstore', '  National   Book Store '");
    return (r[0].store_kind === "bookstore" && r[0].store_name === "National Book Store") || { r };
  });
  await check("A blank name is no name", async () => {
    const r = await add("Charger", "Other", ", 'gadgets', '   '");
    return (r[0].store_kind === "gadgets" && r[0].store_name === null) || { r };
  });
  await check("Only the eight kinds, and names up to 80 characters", async () => {
    const kind = await refused(() => add("Nails", "Other", ", 'hardware', null"));
    const long = await refused(() => add("Nails", "Other", `, 'other', '${"x".repeat(81)}'`));
    return (kind === true && long === true) || { kind, long };
  });
  await check("Editing a line changes its store", async () => {
    await as(ANN, "update buy_items set store_kind = 'market', store_name = 'Farmers Market' where name = 'Rice'");
    const r = (await db.query("select store_kind, store_name from buy_items where name = 'Rice'")).rows;
    return (r[0].store_kind === "market" && r[0].store_name === "Farmers Market") || { r };
  });
  await check("Another household neither sees nor renames the store", async () => {
    const seen = await as(BEN, "select store_name from buy_items where family_id = $1", [A]);
    await as(BEN, "update buy_items set store_name = 'Ben Mart' where name = 'Rice'");
    const r = (await db.query("select store_name from buy_items where name = 'Rice'")).rows;
    return (seen.length === 0 && r[0].store_name === "Farmers Market") || { seen, r };
  });
}
