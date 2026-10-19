// A medicine's times are HH:MM (20261020090200): the reminders tick casts
// them to time, so a value it cannot read is refused at the table, not
// discovered by every household's reminders failing.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const ANN_M = "00000000-0000-0000-0000-0000000000a1";

export default async function ({ as, check, refused }) {
  const add = (times) =>
    as(ANN, "insert into health_medicines (family_id, member_id, name, times, start_date, visibility, created_by) values ($1, $2, 'Test', $3, current_date, 'family', $2) returning id", [A, ANN_M, times]);
  await check("Times the app writes are kept", async () => (await add(["08:00", "20:30", "00:00", "23:59"])).length === 1);
  await check("No times at all is kept", async () => (await add([])).length === 1);
  await check("'8am' is refused", async () => refused(() => add(["8am"]), "times_hhmm"));
  await check("'8:00' and '24:00' are refused", async () => (await refused(() => add(["8:00"]))) && (await refused(() => add(["24:00"]))));
  await check("A good time beside a bad one is refused", async () => refused(() => add(["08:00", "noon"])));
  await check("An edit to a bad time is refused too", async () => {
    const id = (await add(["09:00"]))[0].id;
    return refused(() => as(ANN, "update health_medicines set times = '{9}' where id = $1 returning id", [id]));
  });
}
