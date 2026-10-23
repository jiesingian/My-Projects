// Money spent on an asset (20261023232000): only money tied to an asset can
// be marked as buying or adding to it, and an item added by a payment goes
// when that payment is deleted.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const A_HOUSE = "a5000000-0000-0000-0000-000000000001";
const JOINT_BDO = "a4000000-0000-0000-0000-000000000001";

export default async function ({ as, check, refused }) {
  const ann = U("a1");
  const spend = (capital, sourceTable = "assets") =>
    as(ann, "insert into wealth_transactions (family_id, account_id, direction, amount, particulars, category, source_table, source_id, capital) values ($1, $2, 'out', 120000, 'Kitchen renovation', 'Housing', $3, $4, $5) returning id", [A, JOINT_BDO, sourceTable, A_HOUSE, capital]);

  let tx;
  await check("Money for an asset can be marked as buying or adding to it", async () => {
    tx = (await spend(true))[0].id;
    return typeof tx === "string";
  });
  await check("Money tied to anything else cannot", async () =>
    (await refused(() => spend(true, "goals"))) === true && (await refused(() => spend(true, null))) === true);
  await check("An item added by a payment goes when the payment is deleted", async () => {
    await as(ann, "insert into asset_items (asset_id, family_id, name, kind, cost, transaction_id, created_by) values ($1, $2, 'Kitchen renovation', 'improvement', 120000, $3, $4)", [A_HOUSE, A, tx, P("a1")]);
    const before = (await as(ann, "select 1 from asset_items where transaction_id = $1", [tx])).length;
    await as(ann, "delete from wealth_transactions where id = $1", [tx]);
    return before === 1 && (await as(ann, "select 1 from asset_items where transaction_id = $1", [tx])).length === 0;
  });
}
