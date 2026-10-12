const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Time-capsule letters (20261007090000, read rule from 20261009090000,
// envelopes, occasions and notifications from 20261009090100).
const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const kidM = P("a2"), annM = P("a1"), benM = P("b1");
  await db.exec(`update members set dob = '2015-03-01' where id = '${kidM}'`);
  const later = "current_date + 30";
  const sealed = (await as(ann, `insert into time_capsules (recipient_member_id, title, body, opens_on) values ($1, 'For you', 'Sealed words', ${later}) returning id, writer_member_id, writer_name, family_id`, [kidM]))[0];
  await check("Ann's letter is hers, named, in her household", async () =>
    (sealed.writer_member_id === annM && sealed.writer_name === "Ann A" && sealed.family_id === "a0000000-0000-0000-0000-000000000000") || sealed);
  await check("No date: it opens on Kid's 18th birthday", async () => {
    const r = (await as(ann, "insert into time_capsules (recipient_member_id, body) values ($1, 'At eighteen') returning opens_on::text, occasion", [kidM]))[0];
    return (r.opens_on === "2033-03-01" && r.occasion === "18th birthday") || r;
  });
  await check("No date and no birthday: refused", async () =>
    refused(() => as(ann, "insert into time_capsules (recipient_member_id, body) values ($1, 'x')", [P("a4")])));
  await check("Sealed: Kid (the recipient), Abe (another grown-up) and Ben (another household) cannot read it", async () =>
    (await as(kid, "select 1 from time_capsules")).length === 0 &&
    (await as(abe, "select 1 from time_capsules")).length === 0 &&
    (await as(ben, "select 1 from time_capsules")).length === 0);
  await check("A forged writer is replaced by the caller", async () => {
    const r = (await as(abe, "insert into time_capsules (writer_member_id, recipient_member_id, body, opens_on) values ($1, $2, 'forged', current_date + 5) returning writer_member_id", [annM, kidM]))[0];
    return r.writer_member_id === P("a4") || r;
  });
  await check("A child cannot write one; nobody writes to another household or opens one in the past", async () =>
    (await refused(() => as(kid, `insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', ${later})`, [annM]))) &&
    (await refused(() => as(ann, `insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', ${later})`, [benM]))) &&
    (await refused(() => as(ann, "insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', current_date - 1)", [kidM]))));
  await check("Nobody else edits or deletes it; Ann can't open it early", async () => {
    await as(abe, "update time_capsules set body = 'changed' where id = $1", [sealed.id]);
    await as(kid, "delete from time_capsules where id = $1", [sealed.id]);
    await as(ben, "delete from time_capsules where id = $1", [sealed.id]);
    const early = await refused(() => as(ann, "update time_capsules set opens_on = current_date - 1 where id = $1", [sealed.id]));
    const r = (await as(ann, "select body from time_capsules where id = $1", [sealed.id]))[0];
    return (early && r?.body === "Sealed words") || { early, r };
  });
  await db.exec(`update time_capsules set opens_on = current_date - 1 where id = '${sealed.id}'`);
  await check("Opened: Kid (the recipient) and Ann (the writer) read it; Abe (same household) and Ben (another) still can't", async () =>
    (await as(kid, "select body from time_capsules where id = $1", [sealed.id]))[0]?.body === "Sealed words" &&
    (await as(ann, "select 1 from time_capsules where id = $1", [sealed.id])).length === 1 &&
    (await as(abe, "select 1 from time_capsules where id = $1", [sealed.id])).length === 0 &&
    (await as(ben, "select 1 from time_capsules where id = $1", [sealed.id])).length === 0);
  await check("Opened letters can't be rewritten, even by the writer", async () => {
    await as(ann, "update time_capsules set body = 'rewritten' where id = $1", [sealed.id]);
    return (await as(kid, "select body from time_capsules where id = $1", [sealed.id]))[0]?.body === "Sealed words";
  });
  await as(ann, "insert into time_capsules (recipient_member_id, body, opens_on, occasion) values ($1, 'Well done', current_date + 10, ' Graduation ')", [kidM]);
  await check("Sealed: Kid sees envelopes waiting (from, day, occasion) but no words; Abe and Ben see none", async () => {
    const kidEnv = await as(kid, "select * from my_sealed_letters()");
    const grad = kidEnv.find((r) => r.occasion === "Graduation");
    const noWords = kidEnv.every((r) => !("body" in r) && !("title" in r));
    return (grad?.writer_name === "Ann A" && noWords &&
      (await as(abe, "select * from my_sealed_letters()")).length === 0 &&
      (await as(ben, "select * from my_sealed_letters()")).length === 0) || kidEnv;
  });
  await db.exec("update time_capsules set opens_on = '2030-05-01', notified_at = null where recipient_member_id = '" + kidM + "'");
  const due = (at, secret = SECRET) => db.query("select * from due_letter_notifications($1, $2::timestamptz)", [secret, at]).then((r) => r.rows);
  await check("Notifications: none with a wrong secret, none before 8am on the day", async () =>
    (await due("2030-05-01 09:00+08", "wrong")).length === 0 && (await due("2030-05-01 07:30+08")).length === 0);
  await check("At 9am Kid's devices are told once, one notification for all of the day's letters", async () => {
    const rows = await due("2030-05-01 09:00+08");
    const again = await due("2030-05-01 09:05+08");
    const who = rows.map((r) => r.endpoint);
    return (rows.length === 1 && who[0] === "https://push/Kid A" && /letters open today/.test(rows[0].title) && rows[0].url.startsWith("/journal#letters-") && again.length === 0) || { rows, again };
  });
  await check("With their Letters switch off, Kid isn't told", async () => {
    await db.exec("update time_capsules set notified_at = null, opens_on = '2030-06-01' where recipient_member_id = '" + kidM + "'");
    await db.exec("update members set notification_prefs = notification_prefs || '{\"letters\": false}' where id = '" + kidM + "'");
    const rows = await due("2030-06-01 09:00+08");
    await db.exec("update members set notification_prefs = notification_prefs - 'letters' where id = '" + kidM + "'");
    return rows.length === 0 || rows;
  });
  await check("A letter that opened long ago is never announced", async () => {
    await db.exec("update time_capsules set notified_at = null, opens_on = '2029-01-01' where recipient_member_id = '" + kidM + "'");
    return (await due("2030-05-01 09:00+08")).length === 0;
  });
}
