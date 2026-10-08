const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), dan = U("d1");
  await check("Every existing household starts in Manila", async () =>
    (await db.query("select count(*)::int as n from families where time_zone <> 'Asia/Manila'")).rows[0].n === 0);
  await check("A real zone name is accepted", async () => {
    await db.query("update families set time_zone = 'America/Los_Angeles' where id = $1", [A]);
    return (await as(ann, "select time_zone from families where id = $1", [A]))[0].time_zone === "America/Los_Angeles";
  });
  await check("Junk is refused by the database too", async () =>
    refused(() => db.query("update families set time_zone = 'x; drop table families' where id = $1", [A])));
  await check("Another household cannot read it", async () =>
    (await as(dan, "select time_zone from families where id = $1", [A])).length === 0);
}
