// Undas and babang-luksa reminders (20261019170000): the grown-ups of a
// household with someone on its tree who has passed hear of Undas three days
// ahead and of each person's day (40th day, first year, anniversaries), from
// 09:00 in their own zone, once; a child does not; a household that turned
// it off hears nothing; and a date of passing can't come before a birth.
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, check, refused }) {
  await db.exec(`
    insert into family_tree_people (family_id, full_name, dob, died_on) values
      ('${A}', 'Lola Remedios', '1931-03-02', '2019-11-04'),
      ('${A}', 'Lolo Ben', null, '2025-10-30'),
      ('${A}', 'Tita Leap', null, '2024-02-29'),
      ('${A}', 'Tito Recent', null, '2026-09-22'),
      ('${A}', 'Mama Living', '1960-01-01', null),
      ('${B}', 'Lola ni Ben', null, '2010-11-04'),
      ('${D}', 'Lolo ni Dan', null, '2001-05-05');
    update families set remember_the_departed = false where id = '${B}';
  `);
  const run = async (at) => (await db.query("select * from due_remembrance_reminders($1, $2)", [SECRET, at])).rows;
  const who = (rows) => [...new Set(rows.map((r) => r.endpoint.split("/").pop()))].sort().join("|");

  await check("Without the secret, nothing", async () => (await db.query("select * from due_remembrance_reminders('wrong', '2026-10-29 02:00+00')")).rows.length === 0);
  await check("29 October before 09:00 Manila: nothing yet", async () => (await run("2026-10-29 00:30+00")).length === 0);
  await check("29 October, 10:00 Manila: each household's grown-up hears Undas is on Sunday, naming its own first three", async () => {
    const rows = await run("2026-10-29 02:00+00");
    const r = rows.find((x) => x.endpoint.endsWith("Ann A"));
    return (
      (who(rows) === "Ann A|Dan D" &&
        r.title === "Undas is on Sunday" &&
        r.body.startsWith("Remembering Lola Remedios, Tita Leap, Lolo Ben and 1 more.")) ||
      rows.map((x) => [x.endpoint, x.title, x.body])
    );
  });
  await check("Once: the next tick sends nothing again", async () => (await run("2026-10-29 02:05+00")).length === 0);
  await check("A child with a phone is not told; nor a household that turned it off; nor another household with nobody passed", async () => {
    const rows = await run("2026-10-29 03:00+00");
    return rows.length === 0 || rows.map((x) => x.endpoint);
  });
  await check("The first year: the babang-luksa, on the anniversary morning", async () => {
    const rows = await run("2026-10-30 02:00+00");
    return (rows.length === 1 && rows[0].title === "Remembering Lolo Ben" && rows[0].body.includes("babang-luksa")) || rows.map((x) => [x.title, x.body]);
  });
  await check("The 40th day, counting the day of passing as the first", async () => {
    const rows = await run("2026-10-30 02:00+00");
    const later = await run("2026-10-31 02:00+00");
    return (rows.length === 0 && later.length === 1 && later[0].title === "Remembering Tito Recent" && later[0].body.includes("40th day")) || later.map((x) => [x.title, x.body]);
  });
  await check("A later anniversary says how many years", async () => {
    const rows = await run("2026-11-04 02:00+00");
    return (rows.length === 1 && rows[0].body === "7 years today since their passing.") || rows.map((x) => [x.title, x.body]);
  });
  await check("A 29 February passing is remembered on 28 February in other years", async () => {
    const rows = await run("2027-02-28 02:00+00");
    return (rows.length === 1 && rows[0].title === "Remembering Tita Leap" && rows[0].body.startsWith("3 years")) || rows.map((x) => [x.title, x.body]);
  });
  await check("Switching it off stops it", async () => {
    await db.exec(`update families set remember_the_departed = false where id = '${A}'`);
    const rows = await run("2027-10-29 02:00+00");
    await db.exec(`update families set remember_the_departed = true where id = '${A}'`);
    return !rows.some((x) => x.endpoint.endsWith("Ann A")) || rows.map((x) => x.title);
  });
  await check("A date of passing before the birth is refused", async () =>
    refused(() => db.query("insert into family_tree_people (family_id, full_name, dob, died_on) values ($1, 'Wrong', '2000-01-01', '1999-01-01')", [A])),
  );
}
