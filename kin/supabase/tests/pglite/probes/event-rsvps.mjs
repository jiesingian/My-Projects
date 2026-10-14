const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// Who's coming (20261014090000). Dates are the household's own today
// (household_today), never the server's current_date -- see letter-replies.
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const annM = P("a1"), kidM = P("a2"), babyM = P("a3"), abeM = P("a4"), danM = P("d1");
  const today = "(select (now() at time zone 'Asia/Manila')::date)";
  const ev = async (family, extra = "", values = "") =>
    (await db.query(`insert into events (family_id, title, event_date${extra}) values ($1, 'Party', ${today} + 3${values}) returning id`, [family])).rows[0].id;
  const whole = await ev(A);
  const annOnly = await ev(A, ", applies_to_whole_family", ", false");
  await db.query("insert into event_members (event_id, member_id) values ($1, $2)", [annOnly, annM]);
  const over = await ev(A, ", end_date", `, ${today} - 1`);
  await db.query(`update events set event_date = ${today} - 3 where id = $1`, [over]);
  const yearly = await ev(A, ", recurs_yearly", ", true");
  const dans = await ev(D);
  const answer = (who, event, member, by, a = "going") =>
    as(who, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, $4, $5) on conflict (event_id, member_id) do update set answer = excluded.answer, answered_by = excluded.answered_by, updated_at = now() returning answer", [event, member, A, a, by]);

  await check("Ann answers for herself; Kid (child_self) answers for himself", async () =>
    (await answer(ann, whole, annM, annM))[0]?.answer === "going" && (await answer(kid, whole, kidM, kidM, "maybe"))[0]?.answer === "maybe");
  await check("A grown-up answers for a managed child (no login); Abe (adult) too", async () =>
    (await answer(ann, whole, babyM, annM))[0]?.answer === "going" && (await answer(abe, whole, babyM, abeM, "no"))[0]?.answer === "no");
  await check("A child can't answer for anyone else: not a managed child, not a parent", async () =>
    (await refused(() => answer(kid, whole, babyM, kidM))) === true && (await refused(() => answer(kid, whole, annM, kidM))) === true);
  await check("A grown-up can't answer for a child who has a login, or another grown-up", async () =>
    (await refused(() => answer(ann, whole, kidM, annM))) === true && (await refused(() => answer(ann, whole, abeM, annM))) === true);
  await check("A forged answerer is refused", async () => refused(() => answer(ann, whole, annM, abeM)));
  await check("A forged member from another household is refused", async () => refused(() => answer(ann, whole, danM, annM)));
  await check("Only the people an event is for are asked", async () =>
    (await refused(() => answer(abe, annOnly, abeM, abeM))) === true && (await answer(ann, annOnly, annM, annM))[0]?.answer === "going");
  await check("No answer after the event: not new, not changed, not taken back", async () => {
    await db.query("insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', $2)", [over, annM, A]);
    const changed = await as(ann, "update event_rsvps set answer = 'no', answered_by = $2 where event_id = $1 and member_id = $2 returning 1", [over, annM]);
    const gone = await as(ann, "delete from event_rsvps where event_id = $1 returning 1", [over]);
    const stillReads = (await as(ann, "select answer from event_rsvps where event_id = $1", [over]))[0]?.answer;
    return ((await refused(() => answer(kid, over, kidM, kidM))) === true && changed.length === 0 && gone.length === 0 && stillReads === "going") || { changed, gone, stillReads };
  });
  await check("A yearly event (birthday) takes no answers", async () => refused(() => answer(ann, yearly, annM, annM)));
  await check("The household reads every answer; a child reads them too", async () =>
    (await as(kid, "select 1 from event_rsvps where event_id = $1", [whole])).length === 3);
  await check("A linked household (Ben), a non-sharing one (Cat) and a stranger (Dan) read nothing", async () => {
    const n = await Promise.all([ben, cat, dan].map(async (u) => (await as(u, "select 1 from event_rsvps")).length));
    return n.every((x) => x === 0) || n;
  });
  await check("A linked household can't answer on an event it can't see", async () =>
    refused(() => as(ben, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', $2)", [whole, P("b1"), A])));
  await check("A stranger can't answer on another household's event, even in his own household's name", async () =>
    (await refused(() => as(dan, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', $2)", [whole, danM, D]))) === true &&
    (await as(dan, "insert into event_rsvps (event_id, member_id, family_id, answer, answered_by) values ($1, $2, $3, 'going', $2) returning 1", [dans, danM, D])).length === 1);
  await check("Kid can't change Ann's answer, or move his own onto Ann", async () => {
    const touched = await as(kid, "update event_rsvps set answer = 'no' where event_id = $1 and member_id = $2 returning 1", [whole, annM]);
    return touched.length === 0 && (await refused(() => as(kid, "update event_rsvps set member_id = $2 where event_id = $1 and member_id = $3", [whole, annM, kidM]))) === true;
  });
  await check("Deleting the event takes its answers with it", async () => {
    await as(ann, "delete from events where id = $1", [annOnly]);
    return (await db.query("select 1 from event_rsvps where event_id = $1", [annOnly])).rows.length === 0;
  });

  // The reminder: two days ahead, from 09:00 Manila, to whoever is asked,
  // hasn't answered and has a device. Kid answered above on `whole`; a new
  // event two days out has nobody's answer yet.
  const soon = (await db.query(`insert into events (family_id, title, event_date) values ($1, 'Picnic', ${today} + 2) returning id`, [A])).rows[0].id;
  await answer(ann, soon, annM, annM);
  const at10 = `(((now() at time zone 'Asia/Manila')::date + time '10:00') at time zone 'Asia/Manila')`;
  const at8 = `(((now() at time zone 'Asia/Manila')::date + time '08:00') at time zone 'Asia/Manila')`;
  const due = async (secret, when) =>
    (await db.query(`select * from due_rsvp_reminders($1, ${when}) where url like '%' || $2`, [secret, soon])).rows;
  const secret = "pglite-cron-secret-0123456789abcdef0123456789";
  await check("Not before 09:00", async () => (await due(secret, at8)).length === 0);
  await check("Without the secret, nothing", async () => (await due("wrong", at10)).length === 0);
  await check("At 10:00: only Kid (no answer, has a phone); Ann answered, Abe and Baby have no device", async () => {
    const rows = await due(secret, at10);
    return (rows.length === 1 && rows[0].member_id === kidM && rows[0].title === "Are you coming to Picnic?") || rows;
  });
  await check("Once only", async () => (await due(secret, at10)).length === 0);
  await check("Muted events: no reminder for Kid; Ann, not muted and not answered, still gets hers", async () => {
    const later = (await db.query(`insert into events (family_id, title, event_date) values ($1, 'Lunch', ${today} + 2) returning id`, [A])).rows[0].id;
    await db.query("update members set notification_prefs = '{\"events\": false}' where id = $1", [kidM]);
    const rows = (await db.query(`select * from due_rsvp_reminders($1, ${at10}) where url like '%' || $2`, [secret, later])).rows;
    return (rows.length === 1 && rows[0].member_id === annM) || rows;
  });
}
