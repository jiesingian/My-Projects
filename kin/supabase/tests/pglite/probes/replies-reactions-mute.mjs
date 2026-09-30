const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const annMsg = (await as(ann, "insert into family_tree_messages (body) values ('from A') returning id"))[0].id;
  const benMsg = (await as(ben, "insert into family_tree_messages (body) values ('from B') returning id"))[0].id;
  await check("Ben replies to Ann's family message", async () => !!(await as(ben, "insert into family_tree_messages (body, reply_to) values ('re', $1) returning id", [annMsg]))[0].id);
  await check("Cat cannot quote Ben's message (not linked with B)", async () => refused(() => as(cat, "insert into family_tree_messages (body, reply_to) values ('re', $1)", [benMsg])));
  await check("Dan cannot quote anything", async () => refused(() => as(dan, "insert into family_tree_messages (body, reply_to) values ('re', $1)", [annMsg])));
  // Reactions
  await check("Ben and Cat react to Ann's message", async () => {
    await as(ben, "insert into chat_room_reactions (family_message_id, emoji) values ($1, '❤️')", [annMsg]);
    await as(cat, "insert into chat_room_reactions (family_message_id, emoji) values ($1, '👍')", [annMsg]);
    return true;
  });
  await check("Ann sees both reactions with names; Ben sees his own but not Cat's (C not linked with B)", async () => {
    const a = (await as(ann, "select author_name from chat_room_reactions order by 1")).map((r) => r.author_name);
    const b = (await as(ben, "select author_name from chat_room_reactions order by 1")).map((r) => r.author_name);
    return (JSON.stringify(a) === '["Ben B","Cat C"]' && JSON.stringify(b) === '["Ben B"]') || { a, b };
  });
  await check("Same emoji twice refused", async () => refused(() => as(ben, "insert into chat_room_reactions (family_message_id, emoji) values ($1, '❤️')", [annMsg])));
  await check("Unknown emoji refused", async () => refused(() => as(ben, "insert into chat_room_reactions (family_message_id, emoji) values ($1, '💩')", [annMsg])));
  await check("Dan cannot react (cannot see message)", async () => refused(() => as(dan, "insert into chat_room_reactions (family_message_id, emoji) values ($1, '👍')", [annMsg])));
  await check("Ann cannot delete Ben's reaction", async () => { await as(ann, "delete from chat_room_reactions"); return (await as(ben, "select 1 from chat_room_reactions")).length === 1; });
  // DM: connect Ann-Ben
  await as(ann, "select request_connection($1)", [P("b1")]);
  const cid = (await as(ben, "select id from my_connections() where status='pending'"))[0].id;
  await as(ben, "select respond_connection($1, true)", [cid]);
  const [lo, hi] = [P("a1"), P("b1")].sort();
  const dm = (await as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hi') returning id", [lo, hi]))[0].id;
  await check("Ben replies in the DM; Kid cannot react to it", async () => {
    await as(ben, "insert into direct_messages (person_low, person_high, body, reply_to) values ($1,$2,'hey',$3)", [lo, hi, dm]);
    return refused(() => as(kid, "insert into chat_room_reactions (direct_message_id, emoji) values ($1, '👍')", [dm]));
  });
  await check("Ben cannot quote a family message inside the DM", async () => refused(() => as(ben, "insert into direct_messages (person_low, person_high, body, reply_to) values ($1,$2,'x',$3)", [lo, hi, annMsg])));
  // Seen
  await check("dm_seen_at: null before Ben reads, set after; Dan gets null", async () => {
    const before = (await as(ann, "select dm_seen_at($1) v", [P("b1")]))[0].v;
    await as(ben, "insert into chat_reads (person_id, thread) values ($1, $2)", [P("b1"), `dm:${P("a1")}`]);
    const after = (await as(ann, "select dm_seen_at($1) v", [P("b1")]))[0].v;
    const dan_ = (await as(dan, "select dm_seen_at($1) v", [P("b1")]))[0].v;
    return (before === null && after !== null && dan_ === null) || { before, after, dan_ };
  });
  // Mute
  await check("Prefs: own only", async () => {
    await as(ben, "insert into chat_thread_prefs (person_id, thread, muted) values ($1, 'family', true)", [P("b1")]);
    const forged = await refused(() => as(dan, "insert into chat_thread_prefs (person_id, thread, muted) values ($1, 'family', true)", [P("b1")]));
    return forged === true && (await as(dan, "select * from chat_thread_prefs")).length === 0;
  });
  await check("Ben muted Family: Ann's family push skips Ben, still reaches Cat", async () => {
    const r = (await as(ann, "select endpoint from chat_push_targets('family') order by 1")).map((x) => x.endpoint);
    return JSON.stringify(r) === '["https://push/Cat C"]' || r;
  });
  await check("Ben mutes Ann's DM for an hour: no push; expired mute: push again", async () => {
    await as(ben, "insert into chat_thread_prefs (person_id, thread, muted, muted_until) values ($1, $2, true, now() + interval '1 hour')", [P("b1"), `dm:${P("a1")}`]);
    const muted = (await as(ann, "select endpoint from chat_push_targets($1)", [`dm:${P("b1")}`])).length;
    await db.exec(`update chat_thread_prefs set muted_until = now() - interval '1 minute' where thread = 'dm:${P("a1")}'`);
    const back = (await as(ann, "select endpoint from chat_push_targets($1)", [`dm:${P("b1")}`])).length;
    return (muted === 0 && back === 1) || { muted, back };
  });
  await check("Household mute: push_targets('chat') skips Ann for Kid's message", async () => {
    await db.exec(`update members set notification_prefs = '{}' where full_name = 'Kid A'`);
    const before = (await as(kid, "select endpoint from push_targets('chat')")).map((x) => x.endpoint);
    await as(ann, "insert into chat_thread_prefs (person_id, thread, muted) values ($1, 'household', true)", [P("a1")]);
    const after = (await as(kid, "select endpoint from push_targets('chat')")).map((x) => x.endpoint);
    const other = (await as(kid, "select endpoint from push_targets('events')")).map((x) => x.endpoint);
    return (before.includes("https://push/Ann A") && !after.includes("https://push/Ann A") && other.includes("https://push/Ann A")) || { before, after, other };
  });
}
