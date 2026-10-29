// Kin AI asks each person once (20261030131701): nobody has said yes until
// they do; saying yes or taking it back changes only the caller's own rows;
// someone signed out can do neither.
const ANN = "10000000-0000-0000-0000-0000000000a1";
const BEN = "10000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const ok = async (who) => (await as(who, "select kin_ai_ok() ok"))[0].ok;
  const anon = async (sql) => {
    await db.exec("reset role");
    await db.exec("set role anon");
    try {
      return (await db.query(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };

  await check("Nobody has said yes to Kin AI until they do", async () => (await ok(ANN)) === false && (await ok(BEN)) === false);
  await check("Ann says yes: Ann is asked no more, Ben still is", async () => {
    await as(ANN, "select set_kin_ai_ok(true)");
    return (await ok(ANN)) === true && (await ok(BEN)) === false;
  });
  await check("Ann takes it back", async () => {
    await as(ANN, "select set_kin_ai_ok(false)");
    return (await ok(ANN)) === false;
  });
  await check("Signed out, nobody can say yes for anyone", () => refused(() => anon("select set_kin_ai_ok(true)")));
  await check("Nobody can set the date by hand on someone else's row", async () => {
    try {
      await as(ANN, `update members set kin_ai_ok_at = now() where auth_user_id = '${BEN}'`);
    } catch {
      // refused outright is fine too
    }
    return (await ok(BEN)) === false;
  });
}
