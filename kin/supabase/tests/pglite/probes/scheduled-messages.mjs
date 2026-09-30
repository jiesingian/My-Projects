const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
// Scheduled messages (20260930210000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1");
  const later = "now() + interval '1 hour'";
  const fam = (await as(ann, `insert into scheduled_messages (thread, body, send_at) values ('family', 'Good morning!', ${later}) returning id, person_id`))[0];
  const home = (await as(ann, `insert into scheduled_messages (thread, body, send_at) values ('household', 'Dinner at 7', ${later}) returning id`))[0];
  const dm = (await as(ann, `insert into scheduled_messages (thread, body, send_at) values ($1, 'hi Dan', ${later}) returning id`, [`dm:${P("d1")}`]))[0];
  await check("Ann's scheduled message is hers; Kid and Dan see none", async () =>
    fam.person_id === P("a1") && (await as(kid, "select 1 from scheduled_messages")).length === 0 && (await as(dan, "select 1 from scheduled_messages")).length === 0);
  await check("Nobody schedules as someone else, or in the past, or edits one", async () =>
    (await refused(() => as(kid, `insert into scheduled_messages (person_id, thread, body, send_at) values ($1, 'family', 'x', ${later})`, [P("a1")]))) &&
    (await refused(() => as(ann, "insert into scheduled_messages (thread, body, send_at) values ('family', 'x', now() - interval '1 minute')"))) &&
    (await refused(() => as(ann, "update scheduled_messages set body = 'y' where id = $1", [fam.id]))));
  await check("Kid cannot cancel Ann's", async () => {
    await as(kid, "delete from scheduled_messages where id = $1", [fam.id]);
    return (await as(ann, "select 1 from scheduled_messages where id = $1", [fam.id])).length === 1;
  });
  await check("Nothing is due yet: nothing sent", async () => (await db.query("select * from due_scheduled_messages($1)", [SECRET])).rows.length === 0);
  await db.exec("update scheduled_messages set send_at = now() - interval '1 minute'");
  await check("A wrong secret sends nothing", async () => {
    const r = (await db.query("select * from due_scheduled_messages('wrong')")).rows.length;
    const pending = (await db.query("select count(*)::int n from scheduled_messages where sent_at is null")).rows[0].n;
    return (r === 0 && pending === 3) || { r, pending };
  });
  let pushes;
  await check("Due: the family message goes out as Ann, the household one too", async () => {
    pushes = (await db.query("select * from due_scheduled_messages($1)", [SECRET])).rows;
    const f = (await as(ann, "select author_name, person_id from family_tree_messages where body = 'Good morning!'"))[0];
    const h = (await db.query("select member_id from family_messages where body = 'Dinner at 7'")).rows[0];
    const annMember = (await db.query("select id from members where full_name = 'Ann A'")).rows[0].id;
    return (f?.author_name === "Ann A" && f?.person_id === P("a1") && h?.member_id === annMember) || { f, h };
  });
  await check("Notifications go to the others (Ben, linked), never to Ann, and not to Kid, whose chat switch is off", async () => {
    const who = pushes.map((r) => r.endpoint.split("/").pop());
    return (who.includes("Ben B") && !who.includes("Ann A") && !who.includes("Kid A")) || who;
  });
  await check("The DM to Dan (not connected) is marked failed, not sent", async () => {
    const r = (await db.query("select sent_at, failed from scheduled_messages where id = $1", [dm.id])).rows[0];
    const sent = (await db.query("select 1 from direct_messages where body = 'hi Dan'")).rows.length;
    return (r.sent_at !== null && r.failed && sent === 0) || { r, sent };
  });
  await check("Each goes once: a second run sends nothing", async () => (await db.query("select * from due_scheduled_messages($1)", [SECRET])).rows.length === 0);
  await check("A sent one can no longer be cancelled", async () => {
    await as(ann, "delete from scheduled_messages where id = $1", [home.id]);
    return (await as(ann, "select 1 from scheduled_messages where id = $1", [home.id])).length === 1;
  });
}
