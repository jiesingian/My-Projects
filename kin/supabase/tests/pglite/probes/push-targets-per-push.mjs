// A sender gets only the devices of the people this one push is for, each
// once (20261021130000_push_targets_per_push.sql).
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const annM = M("a1"), kidM = M("a2"), abeM = M("a4"), benM = M("b1");
  const all = [annM, kidM, abeM, benM];
  const msg = (id, who, ago = "0 minutes") =>
    db.exec(`insert into family_messages (id, family_id, member_id, body, created_at) select '${id}', family_id, id, 'hi', now() - interval '${ago}' from members where id = '${who}'`);
  const targets = async (who, kind, ids, source) =>
    (await as(who, "select endpoint from push_targets($1, $2::uuid[], $3::uuid) order by 1", [kind, ids, source])).map((r) => r.endpoint.split("/").pop());
  // Kid's chat switch is off in base.sql and Abe joined after the devices
  // were seeded: both on, with a phone, here.
  await db.exec(`
    update members set notification_prefs = '{}' where id = '${kidM}';
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) select id, family_id, 'https://push/'||full_name, 'k', 'a' from members where id = '${abeM}';
    alter table routine_log add column if not exists logged_by uuid, add column if not exists logged_at timestamptz, add column if not exists approval text;
  `);
  const same = (got, want) => JSON.stringify(got) === JSON.stringify(want) || got;

  await check("The wide two-argument question is gone", async () => refused(() => as(ann, "select * from push_targets('chat', $1::uuid[])", [[kidM]])));
  await check("No event behind it: nothing", async () => same(await targets(ann, "chat", all, "f1000000-0000-0000-0000-000000000001"), []));

  const annMsg = "f1000000-0000-0000-0000-0000000000a1";
  await msg(annMsg, annM);
  await check("Ann's message just now: the household she named, not herself, not another household", async () => same(await targets(ann, "chat", all, annMsg), ["Abe A", "Kid A"]));
  await check("Once: asking again for the same message hands out nothing", async () => same(await targets(ann, "chat", all, annMsg), []));
  await check("Only who was named", async () => {
    const m2 = "f1000000-0000-0000-0000-0000000000a2";
    await msg(m2, annM);
    return same(await targets(ann, "chat", [kidM], m2), ["Kid A"]);
  });
  await check("A child can't fetch a grown-up's devices with someone else's message", async () => {
    const m3 = "f1000000-0000-0000-0000-0000000000a3";
    await msg(m3, annM);
    return same(await targets(kid, "chat", [annM, abeM], m3), []);
  });
  await check("A child can't fetch a grown-up's for a chore with nothing waiting", async () => same(await targets(kid, "approvals", [annM], "f1000000-0000-0000-0000-0000000000a4"), []));
  await check("Another household gets nothing, even naming Ann with its own message", async () => {
    const m4 = "f1000000-0000-0000-0000-0000000000b1";
    await msg(m4, benM);
    return same(await targets(ben, "chat", [annM, kidM], m4), []) === true && same(await targets(ben, "chat", [annM], annMsg), []);
  });
  await check("An old message warrants nothing", async () => {
    const m5 = "f1000000-0000-0000-0000-0000000000a5";
    await msg(m5, annM, "10 minutes");
    return same(await targets(ann, "chat", all, m5), []);
  });

  await check("'Are you okay?' reaches the one asked, not the rest named", async () => {
    const c = (await db.query(`insert into member_checkins (family_id, asked_by, member_id) select family_id, '${annM}', '${kidM}' from members where id = '${annM}' returning id`)).rows[0].id;
    return same(await targets(ann, "checkins", [kidM, abeM], c), ["Kid A"]);
  });

  const call = "f2000000-0000-0000-0000-000000000001";
  await check("A call rings its callee", async () => same(await targets(ann, "calls", [kidM], call), ["Kid A"]));
  await check("And again while it rings", async () => same(await targets(ann, "calls", [kidM], call), ["Kid A"]));
  await check("The same call can't be turned on someone else", async () => same(await targets(ann, "calls", [abeM], call), []));
  await check("Nor used by another member", async () => same(await targets(abe, "calls", [kidM], call), []));
  await check("'Ann is calling Kid' reaches the other grown-ups only", async () => same(await targets(ann, "family_calls", all, call), ["Abe A"]));
  await check("A call to another household rings nobody", async () => same(await targets(ann, "calls", [benM], "f2000000-0000-0000-0000-000000000002"), []));

  await check("Nobody may read the hand-out ledgers", async () => (await refused(() => as(ann, "select * from push_handouts"))) === true && (await refused(() => as(ann, "select * from push_call_rings"))) === true);
  await check("Nor call the inner functions", async () =>
    (await refused(() => as(ann, "select push_warranted('chat', $1, $2::uuid[])", [annMsg, all]))) === true &&
    (await refused(() => as(ann, "select push_hand_out('chat', $1, $2)", [annMsg, kidM]))) === true &&
    (await refused(() => as(ann, "select * from tree_story_recipients($1, true)", [annMsg]))) === true);
}
