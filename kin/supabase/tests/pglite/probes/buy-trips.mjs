// Past trips, kept for a week (20261023210000): the household reads, adds and
// removes its own; nobody else sees them; a trip over a week old is unread
// and then swept away.
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const BEN = "10000000-0000-0000-0000-0000000000b1";
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const BEN_M = "00000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const items = JSON.stringify([{ name: "Rice", budget: 110, actual: 104 }]);
  await check("Ann records her checkout and reads it back", async () => {
    await as(ANN, "insert into buy_trips (family_id, created_by, budget, actual, savings, item_count, items) values ($1, $2, 110, 104, 6, 1, $3)", [A, ANN_M, items]);
    const r = await as(ANN, "select savings, items from buy_trips");
    return (r.length === 1 && Number(r[0].savings) === 6 && r[0].items[0].name === "Rice") || { r };
  });
  await check("Nobody writes a trip for another household, or as someone else", async () => {
    const other = await refused(() => as(ANN, "insert into buy_trips (family_id, created_by) values ($1, $2)", [B, ANN_M]));
    const forged = await refused(() => as(ANN, "insert into buy_trips (family_id, created_by) values ($1, $2)", [A, BEN_M]));
    const backdated = await refused(() => as(ANN, "insert into buy_trips (family_id, created_by, checked_out_at) values ($1, $2, now() - interval '3 days')", [A, ANN_M]));
    return (other === true && forged === true && backdated === true) || { other, forged, backdated };
  });
  await check("Ben neither sees nor removes Ann's trips", async () => {
    const seen = await as(BEN, "select 1 from buy_trips where family_id = $1", [A]);
    await as(BEN, "delete from buy_trips where family_id = $1", [A]);
    const left = (await db.query("select 1 from buy_trips where family_id = $1", [A])).rows;
    return (seen.length === 0 && left.length === 1) || { seen, left };
  });
  await check("Nobody edits a trip after the fact", async () => {
    await as(ANN, "update buy_trips set actual = 1").catch(() => null);
    const r = (await db.query("select actual from buy_trips")).rows;
    return Number(r[0].actual) === 104 || { r };
  });
  await check("A trip over a week old is no longer read, and the sweep removes it", async () => {
    await db.query("insert into buy_trips (family_id, created_by, checked_out_at) values ($1, $2, now() - interval '8 days')", [A, ANN_M]);
    const seen = await as(ANN, "select 1 from buy_trips");
    await db.exec("reset role");
    await db.query("select public.sweep_buy_trips()");
    const left = (await db.query("select checked_out_at > now() - interval '7 days' as fresh from buy_trips")).rows;
    return (seen.length === 1 && left.length === 1 && left[0].fresh === true) || { seen, left };
  });
  await check("Ann removes a trip of her own household", async () => {
    await as(ANN, "delete from buy_trips");
    return (await db.query("select 1 from buy_trips")).rows.length === 0;
  });
  await check("The sweep is not callable by a member", async () =>
    (await refused(() => as(ANN, "select public.sweep_buy_trips()"))) === true);
}
