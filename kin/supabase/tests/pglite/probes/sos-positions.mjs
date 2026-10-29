// An SOS alert keeps its position for 30 days (20261030110000): the nightly
// job blanks an older alert's lat, lng and accuracy and keeps the alert;
// a recent one is untouched; a member cannot run the job.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const ANN_MEMBER = "00000000-0000-0000-0000-0000000000a1";

export default async function ({ db, as, check, refused }) {
  await db.exec("reset role");
  const { rows } = await db.query(
    `insert into sos_alerts (family_id, member_id, created_at, lat, lng, accuracy_m) values
       ($1, $2, now() - interval '31 days', 14.55, 121.02, 12),
       ($1, $2, now() - interval '2 days', 14.56, 121.03, 20)
     returning id`,
    [A, ANN_MEMBER],
  );
  const [oldId, newId] = rows.map((r) => r.id);
  const read = async (id) => (await db.query("select lat, lng, accuracy_m from sos_alerts where id = $1", [id])).rows[0];

  await check("A member cannot run the sweep", () => refused(() => as(ANN, "select clear_old_sos_positions()")));
  await check("The sweep blanks only the alert older than 30 days, and says how many", async () => {
    await db.exec("reset role");
    const n = (await db.query("select clear_old_sos_positions() n")).rows[0].n;
    return n === 1 || n;
  });
  await check("The old alert is still there, with no position", async () => {
    const r = await read(oldId);
    return (r && r.lat === null && r.lng === null && r.accuracy_m === null) || r;
  });
  await check("The recent alert keeps its position", async () => {
    const r = await read(newId);
    return (r && r.lat === 14.56 && r.accuracy_m === 20) || r;
  });
  await db.exec("reset role");
  await db.query("delete from sos_alerts where id = any($1)", [[oldId, newId]]);
}
