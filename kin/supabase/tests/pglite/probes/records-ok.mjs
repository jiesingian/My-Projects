// One OK before health or money records (20261030130000): it is recorded on
// the caller's own rows only, for the area named, and not for anyone else.
const ANN = "10000000-0000-0000-0000-0000000000a1";
const BEN = "10000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const read = async (who) =>
    (await db.query("select health_ok_at is not null h, money_ok_at is not null m from members where auth_user_id = $1", [who])).rows[0];
  await db.exec("reset role");
  await check("Nobody has said OK until they do", async () => {
    const a = await read(ANN);
    return (!a.h && !a.m) || a;
  });
  await check("Ann's OK for health is hers, and for health only", async () => {
    await as(ANN, "select set_records_ok('health')");
    await db.exec("reset role");
    const a = await read(ANN);
    const b = await read(BEN);
    return (a.h && !a.m && !b.h) || { a, b };
  });
  await check("An area that isn't one is refused", () => refused(() => as(ANN, "select set_records_ok('vault')")));
  await check("Signed out, it is refused", async () => {
    await db.exec("reset role");
    await db.exec("set role anon");
    try {
      await db.query("select set_records_ok('money')");
      return false;
    } catch {
      return true;
    } finally {
      await db.exec("reset role");
    }
  });
}
