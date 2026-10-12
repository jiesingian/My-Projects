// What a property is made of (20261012190000): an item is seen exactly where
// its asset is, written only by the household's grown-ups in their own name,
// and never hung under another household's asset.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const HOUSE = "a5000000-0000-0000-0000-000000000001";
const DAN_CONDO = "d5000000-0000-0000-0000-000000000001";

const item = (asset, by, { family = A, name = "Aircon", kind = "appliance", cost = 45000 } = {}) =>
  `insert into asset_items (asset_id, family_id, name, kind, cost, acquired_on, created_by) values ('${asset}', '${family}', '${name}', '${kind}', ${cost}, '2024-05-01', '${by}') returning id`;

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");

  let aircon;
  await check("Ann (a parent) adds an aircon under the house", async () => {
    aircon = (await as(ann, item(HOUSE, P("a1"))))[0].id;
    return typeof aircon === "string";
  });
  await check("Abe (an adult) adds a sofa, and sees both", async () =>
    (await as(abe, item(HOUSE, P("a4"), { name: "Sofa", kind: "furniture", cost: 30000 }))).length === 1 &&
    (await as(abe, "select 1 from asset_items where asset_id = $1", [HOUSE])).length === 2);
  await check("Kid cannot add, change or remove one", async () =>
    (await refused(() => as(kid, item(HOUSE, P("a2"))))) === true &&
    (await as(kid, "update asset_items set cost = 1 returning id")).length === 0 &&
    (await as(kid, "delete from asset_items returning id")).length === 0);
  await check("Ben (linked household) and Dan (stranger) see none", async () =>
    (await as(ben, "select 1 from asset_items")).length === 0 && (await as(dan, "select 1 from asset_items")).length === 0);
  await check("Dan cannot change or remove House A's", async () =>
    (await as(dan, "update asset_items set cost = 1 returning id")).length === 0 &&
    (await as(dan, "delete from asset_items returning id")).length === 0);
  await check("Dan cannot write into House A, even naming Ann", async () =>
    refused(() => as(dan, item(HOUSE, P("a1")))));
  await check("Abe cannot add one in Ann's name (forged author)", async () => refused(() => as(abe, item(HOUSE, P("a1")))));
  await check("Ann cannot hang one under Dan's condo", async () =>
    (await refused(() => as(ann, item(DAN_CONDO, P("a1"))))) === true &&
    (await refused(() => as(ann, item(DAN_CONDO, P("a1"), { family: "d0000000-0000-0000-0000-000000000000" })))) === true);
  await check("Ann cannot move one under Dan's condo", async () =>
    refused(() => as(ann, `update asset_items set asset_id = '${DAN_CONDO}' where id = $1`, [aircon])));
  await check("A kind outside the list, or a negative price, is refused", async () =>
    (await refused(() => as(ann, item(HOUSE, P("a1"), { kind: "boat" })))) === true &&
    (await refused(() => as(ann, item(HOUSE, P("a1"), { cost: -1 })))) === true);
  await check("Removing the house takes its items with it", async () => {
    await as(ann, "delete from assets where id = $1", [HOUSE]);
    return (await as(ann, "select 1 from asset_items")).length === 0;
  });
}
