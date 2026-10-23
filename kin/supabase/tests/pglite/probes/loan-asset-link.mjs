// A loan linked to the asset it bought (20261023231000): only to an asset of
// the same household (liability_asset_in_family), and an asset removed
// leaves its loan standing, unlinked.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A_LOAN = "a6000000-0000-0000-0000-000000000001";
const D_LOAN = "d6000000-0000-0000-0000-000000000001";
const A_HOUSE = "a5000000-0000-0000-0000-000000000001";
const D_CONDO = "d5000000-0000-0000-0000-000000000001";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), dan = U("d1");
  const link = (who, loan, asset) => as(who, "update liabilities set asset_id = $2 where id = $1 returning asset_id", [loan, asset]);

  await check("Ann links the housing loan to the house", async () => (await link(ann, A_LOAN, A_HOUSE))[0]?.asset_id === A_HOUSE);
  await check("liability_asset_in_family: a loan cannot hang on another household's asset", async () =>
    (await refused(() => link(ann, A_LOAN, D_CONDO), "liability_asset_not_in_family")) === true &&
    (await refused(() => link(dan, D_LOAN, A_HOUSE), "liability_asset_not_in_family")) === true);
  await check("Dan cannot touch House A's loan's link", async () => (await link(dan, A_LOAN, null)).length === 0);
  await check("Unlinking leaves the loan as it was", async () => (await link(ann, A_LOAN, null))[0]?.asset_id === null);
  await check("Removing the asset leaves its loan standing, unlinked", async () => {
    await link(ann, A_LOAN, A_HOUSE);
    await as(ann, "delete from assets where id = $1", [A_HOUSE]);
    const r = await as(ann, "select asset_id, balance from liabilities where id = $1", [A_LOAN]);
    return r.length === 1 && r[0].asset_id === null;
  });
}
