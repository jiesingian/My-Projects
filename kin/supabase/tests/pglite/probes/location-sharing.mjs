const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// Opt-in location sharing (20260922071500 + 20261007160000). Ann is a parent
// and Kid a child with their own login in house A; Dan and Dee (a child_self)
// are house D, strangers to A.
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1"), dee = U("d2");
  const row = (who, member) => as(who, "select * from member_locations where member_id = $1", [member]);

  // --- saved places
  let home;
  await check("A grown-up saves a place for the household", async () => {
    home = (await as(ann, "insert into household_places (family_id, name, lat, lng, created_by) values ($1, 'Home', 14.6, 121.0, $2) returning id", [A, M("a1")]))[0].id;
    return !!home;
  });
  await check("The household's child can see it", async () => (await as(kid, "select name from household_places")).length === 1);
  await check("Another household sees none of it", async () => (await as(dan, "select 1 from household_places")).length === 0);
  await check("A child cannot add a place", async () =>
    refused(() => as(kid, "insert into household_places (family_id, name, lat, lng, created_by) values ($1, 'Mall', 14.5, 121.0, $2)", [A, M("a2")])));
  await check("Nobody adds a place to another household", async () =>
    refused(() => as(dan, "insert into household_places (family_id, name, lat, lng, created_by) values ($1, 'Spy', 14.5, 121.0, $2)", [A, M("d1")])));
  await check("A child cannot move or delete a place", async () => {
    await as(kid, "update household_places set lat = 0 where id = $1", [home]);
    await as(kid, "delete from household_places where id = $1", [home]);
    const r = await as(ann, "select lat from household_places where id = $1", [home]);
    return r.length === 1 && r[0].lat === 14.6;
  });

  // --- a child with their own login needs a grown-up's okay
  await check("A child cannot switch sharing on without a grown-up's okay", async () =>
    refused(() => as(kid, "insert into member_locations (member_id, family_id, sharing) values ($1, $2, true)", [M("a2"), A]), "okay"));
  await check("A child cannot okay themselves", async () =>
    refused(() => as(kid, "insert into member_locations (member_id, family_id, sharing, parent_ok) values ($1, $2, false, true)", [M("a2"), A]), "grown-up"));
  await check("A parent gives the okay, but it does not switch sharing on", async () => {
    await as(ann, "insert into member_locations (member_id, family_id, sharing, parent_ok) values ($1, $2, false, true)", [M("a2"), A]);
    const r = await row(ann, M("a2"));
    return r[0].parent_ok === true && r[0].sharing === false;
  });
  await check("A parent cannot switch a child's sharing on for them", async () =>
    refused(() => as(ann, "update member_locations set sharing = true where member_id = $1", [M("a2")]), "Only they"));
  await check("With the okay, the child switches it on and reports from their phone", async () => {
    await as(kid, "update member_locations set sharing = true where member_id = $1", [M("a2")]);
    await as(kid, "update member_locations set lat = 14.6, lng = 121.0, place_id = $2 where member_id = $1", [M("a2"), home]);
    const r = await row(ann, M("a2"));
    return r[0].sharing === true && r[0].lat === 14.6;
  });
  await check("A parent cannot put a position on a child's row", async () =>
    refused(() => as(ann, "update member_locations set lat = 1, lng = 1 where member_id = $1", [M("a2")])));
  await check("Withdrawing the okay switches sharing off and clears the position", async () => {
    await as(ann, "update member_locations set parent_ok = false, lat = null, lng = null where member_id = $1", [M("a2")]);
    const r = await row(ann, M("a2"));
    return r[0].sharing === false && r[0].lat === null && r[0].place_id === null;
  });

  // --- grown-ups, pause, and other households
  await check("A grown-up shares their own position", async () => {
    await as(ann, "insert into member_locations (member_id, family_id, sharing) values ($1, $2, true)", [M("a1"), A]);
    await as(ann, "update member_locations set lat = 14.6, lng = 121.0 where member_id = $1", [M("a1")]);
    return (await row(kid, M("a1")))[0].lat === 14.6;
  });
  await check("Another household cannot see it", async () => (await row(dan, M("a1"))).length === 0);
  await check("Pausing keeps sharing on but holds no position", async () => {
    await as(ann, "update member_locations set paused_until = now() + interval '1 hour', lat = null, lng = null, accuracy_m = null where member_id = $1", [M("a1")]);
    const r = await row(kid, M("a1"));
    return r[0].sharing === true && r[0].paused_until !== null && r[0].lat === null;
  });
  await check("Nobody else can write a grown-up's row", async () => {
    const kidRefused = await refused(() => as(kid, "update member_locations set sharing = false where member_id = $1", [M("a1")]));
    await as(dan, "update member_locations set sharing = false where member_id = $1", [M("a1")]); // sees no row
    return kidRefused && (await row(ann, M("a1")))[0].sharing === true;
  });
  await check("A grown-up of another household cannot okay a child here", async () =>
    refused(() => as(dan, "insert into member_locations (member_id, family_id, sharing, parent_ok) values ($1, $2, false, true)", [M("a2"), A])));
  await check("A stranger's child is no different: still needs their own grown-up", async () =>
    refused(() => as(dee, "insert into member_locations (member_id, family_id, sharing) values ($1, $2, true)", [M("d2"), D]), "okay"));
  await check("Switching off clears the position", async () => {
    await as(ann, "update member_locations set paused_until = null, lat = 14.6, lng = 121.0 where member_id = $1", [M("a1")]);
    await as(ann, "update member_locations set sharing = false where member_id = $1", [M("a1")]);
    return (await row(ann, M("a1")))[0].lat === null;
  });
}
