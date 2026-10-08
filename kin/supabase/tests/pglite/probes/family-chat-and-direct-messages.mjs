const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000", B = "b0000000-0000-0000-0000-000000000000", C = "c0000000-0000-0000-0000-000000000000", D = "d0000000-0000-0000-0000-000000000000";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  // Family room. A-B linked, C-A linked, B-C not linked; D alone.
  await check("Ann writes to Family; author set by the database, not the client", async () => {
    const r = await as(ann, "insert into family_tree_messages (family_id, member_id, author_name, body) values ($1, $2, 'Forged', 'hi from A') returning author_name, family_id", [A, P("a1")]);
    return (r[0].author_name === "Ann A" && r[0].family_id === A) || r;
  });
  await check("Ben cannot post as House A", async () => refused(() => as(ben, "insert into family_tree_messages (family_id, member_id, body) values ($1, $2, 'x')", [A, P("a1")])) === true ||
    (await as(ben, "select family_id from family_tree_messages where body='x'")).every((r) => r.family_id === B));
  await as(ben, "delete from family_tree_messages where body='x'");
  await check("Ben (linked) and Cat (linked) see Ann's message", async () =>
    (await as(ben, "select 1 from family_tree_messages where body='hi from A'")).length === 1 && (await as(cat, "select 1 from family_tree_messages where body='hi from A'")).length === 1);
  await check("Dan (not linked) sees nothing", async () => (await as(dan, "select * from family_tree_messages")).length === 0);
  await as(ben, "insert into family_tree_messages (body) values ('hi from B')");
  await check("Cat (not linked with B) does not see Ben's message; Ann does", async () =>
    (await as(cat, "select 1 from family_tree_messages where body='hi from B'")).length === 0 && (await as(ann, "select 1 from family_tree_messages where body='hi from B'")).length === 1);
  await check("Ann cannot delete Ben's message", async () => { await as(ann, "delete from family_tree_messages where body='hi from B'"); return (await as(ben, "select 1 from family_tree_messages where body='hi from B'")).length === 1; });
  // Since 20260930150100 the writer may edit their own words (edit-unsend.mjs
  // covers it); nobody else can, and a linked reader changes no row.
  await check("Only the writer can edit: Ben's update changes nothing", async () => {
    await as(ben, "update family_tree_messages set body='edited' where body='hi from A'");
    return (await as(ann, "select 1 from family_tree_messages where body='hi from A'")).length === 1;
  });
  await check("Revoking A-B hides each side's words from the other at once", async () => {
    await db.exec(`update family_links set status='revoked' where requester_family_id='${A}' and addressee_family_id='${B}'`);
    const r = (await as(ben, "select 1 from family_tree_messages where body='hi from A'")).length === 0;
    await db.exec(`update family_links set status='accepted' where requester_family_id='${A}' and addressee_family_id='${B}'`);
    return r;
  });

  // One to one. Connect Ann-Ben; Ann-Dan by code.
  await as(ann, "select request_connection($1)", [P("b1")]);
  const annBen = (await as(ben, "select id from my_connections()"))[0].id;
  await as(ben, "select respond_connection($1, true)", [annBen]);
  const [lo, hi] = [P("a1"), P("b1")].sort();
  await check("Ann messages Ben", async () => { const r = await as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hello Ben') returning sender_person_id", [lo, hi]); return r[0].sender_person_id === P("a1") || r; });
  await check("Ben reads it; Kid and Dan cannot", async () =>
    (await as(ben, "select 1 from direct_messages")).length === 1 && (await as(kid, "select 1 from direct_messages")).length === 0 && (await as(dan, "select 1 from direct_messages")).length === 0);
  await check("Kid cannot write into Ann-Ben's conversation", async () => refused(() => as(kid, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'sneaky')", [lo, hi])));
  const [lo2, hi2] = [P("a1"), P("d1")].sort();
  await check("Ann cannot message Dan (not connected)", async () => refused(() => as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hey')", [lo2, hi2])));
  await check("Dan cannot message Ann-Ben pair pretending", async () => refused(() => as(dan, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hey')", [lo, hi])));
  await check("Ann's direct threads: Ben, named", async () => { const r = await as(ann, "select full_name, connected from my_direct_threads()"); return (r.length === 1 && r[0].full_name === "Ben B" && r[0].connected) || r; });
  await check("After removal: history readable, no new messages, name hidden", async () => {
    await as(ann, "select remove_connection($1)", [annBen]);
    const read = (await as(ben, "select 1 from direct_messages")).length === 1;
    const blocked = await refused(() => as(ben, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'still there?')", [lo, hi]));
    const t = await as(ben, "select full_name, connected from my_direct_threads()");
    return (read && blocked === true && t.length === 1 && t[0].full_name === "Former connection" && !t[0].connected) || { read, blocked, t };
  });

  // Reads
  await check("chat_reads: own row only", async () => {
    await as(ann, "insert into chat_reads (person_id, thread) values ($1, 'family')", [P("a1")]);
    const forged = await refused(() => as(dan, "insert into chat_reads (person_id, thread) values ($1, 'family')", [P("a1")]));
    return forged === true && (await as(dan, "select * from chat_reads")).length === 0 && (await as(ann, "select * from chat_reads")).length === 1;
  });
  await check("chat_reads refuses a made-up thread key", async () => refused(() => as(ann, "insert into chat_reads (person_id, thread) values ($1, 'anything')", [P("a1")])));

  // Topics
  const topic = async (who, t) => (await as(who, "select chat_topic_is_mine($1) v", [t]))[0].v;
  await check("Topics: own family-tree yes, another's no", async () => (await topic(ann, `family-tree:${A}`)) === true && (await topic(dan, `family-tree:${A}`)) === false);
  await check("Topics: dm pair yes for Ann, no for Dan, no in wrong order", async () =>
    (await topic(ann, `dm:${lo}:${hi}`)) === true && (await topic(dan, `dm:${lo}:${hi}`)) === false && (await topic(ann, `dm:${hi}:${lo}`)) === false);
  await check("Topics: household chat unchanged", async () => (await topic(ann, `family-chat:${A}`)) === true && (await topic(ben, `family-chat:${A}`)) === false);

  // Push
  const targets = async (who, t) => (await as(who, "select endpoint from chat_push_targets($1) order by 1", [t])).map((r) => r.endpoint);
  await check("Family push from Ann: Ben and Cat (linked), not Kid (chat off), not Ann, not Dan", async () => { const r = await targets(ann, "family"); return JSON.stringify(r) === '["https://push/Ben B","https://push/Cat C"]' || r; });
  await check("DM push only while connected", async () => {
    const before = await targets(ann, `dm:${P("b1")}`);
    await as(ann, "select request_connection($1)", [P("b1")]);
    const id = (await as(ben, "select id from my_connections() where status='pending'"))[0].id;
    await as(ben, "select respond_connection($1, true)", [id]);
    const after = await targets(ann, `dm:${P("b1")}`);
    return (before.length === 0 && JSON.stringify(after) === '["https://push/Ben B"]') || { before, after };
  });
  await check("Unread: Ben has 1 from Ann in family, 1 dm; Ann's own not counted", async () => {
    const r = Object.fromEntries((await as(ben, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)]));
    const mine = Object.fromEntries((await as(ann, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)]));
    return (r.family === 1 && r[`dm:${P("a1")}`] === 1 && mine[`dm:${P("b1")}`] === undefined) || { r, mine };
  });
  await check("Unread: marking read clears it", async () => {
    await as(ben, "insert into chat_reads (person_id, thread, last_read_at) values ($1, 'family', now()) on conflict (person_id, thread) do update set last_read_at = now()", [P("b1")]);
    const r = Object.fromEntries((await as(ben, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)]));
    return r.family === 0 || r;
  });
  await check("Unread: family messages older than 14 days are not counted", async () => {
    await as(ben, "delete from chat_reads where thread = 'family'");
    const before = Object.fromEntries((await as(ben, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)])).family;
    await db.exec("update family_tree_messages set created_at = created_at - interval '15 days'");
    const after = Object.fromEntries((await as(ben, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)])).family;
    await db.exec("update family_tree_messages set created_at = created_at + interval '15 days'");
    return (before === 1 && after === 0) || { before, after };
  });
  await check("Unread: Dan counts nothing of anyone's", async () => (await as(dan, "select coalesce(sum(unread),0) s from my_chat_unread()"))[0].s == 0);
  await check("Dan cannot get Ben's devices via dm push", async () => (await targets(dan, `dm:${P("b1")}`)).length === 0);
}
