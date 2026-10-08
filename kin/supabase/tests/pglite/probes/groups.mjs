const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2");
  // Ann connects with Dan by code.
  const code = (await as(dan, "select my_connection_code() c"))[0].c;
  const cid = (await as(ann, "select request_connection_by_code($1) id", [code]))[0].id;
  await as(dan, "select respond_connection($1, true)", [cid]);
  let g;
  await check("Ann makes 'Cousins' with Kid (household), Ben (linked tree) and Dan (connection)", async () => {
    g = (await as(ann, "select create_chat_group('Cousins', false, $1) id", [[P("a2"), P("b1"), P("d1")]]))[0].id;
    return (await as(ann, "select count(*)::int n from chat_group_members where group_id=$1", [g]))[0].n === 4;
  });
  await check("Ann cannot add Cat (linked but not sharing, not connected) or Dee (stranger's kid)", async () =>
    (await refused(() => as(ann, "select create_chat_group('X', false, $1)", [[P("c1")]]), "only add")) === true &&
    (await refused(() => as(ann, "select add_chat_group_members($1, $2)", [g, [P("d2")]]), "only add")) === true);
  await check("Cat and Dee see nothing of the group", async () =>
    (await as(cat, "select * from chat_groups")).length === 0 && (await as(dee, "select * from chat_group_members")).length === 0);
  await check("Dan sees the members with names (Ben, Kid included)", async () => {
    const r = (await as(dan, "select full_name, role from group_members_of($1) order by full_name", [g]));
    return (r.length === 4 && r.find((x) => x.full_name === "Ann A").role === "admin") || r;
  });
  await check("Cat asking for members gets nothing", async () => (await as(cat, "select * from group_members_of($1)", [g])).length === 0);
  let msg;
  await check("Dan writes; author set by db; Ben reads it", async () => {
    msg = (await as(dan, "insert into chat_group_messages (group_id, body, author_name) values ($1,'hi all','Forged') returning id, author_name", [g]))[0];
    return msg.author_name === "Dan D" && (await as(ben, "select 1 from chat_group_messages")).length === 1;
  });
  await check("Cat cannot write into the group", async () => refused(() => as(cat, "insert into chat_group_messages (group_id, body) values ($1,'x')", [g])));
  await check("Ben (not admin) cannot add or remove people", async () =>
    (await refused(() => as(ben, "select add_chat_group_members($1, $2)", [g, [P("a1")]]), "Only an admin")) === true &&
    (await refused(() => as(ben, "select remove_chat_group_member($1, $2)", [g, P("d1")]), "Only an admin")) === true);
  await check("Group reactions and photos: Ben reacts; Dan's photo readable by Kid, not Cat", async () => {
    await as(ben, "insert into chat_room_reactions (group_message_id, emoji) values ($1,'👍')", [msg.id]);
    // Dan's photo lives in House D folder: stub object
    await db.exec(`insert into storage.objects (bucket_id, name) values ('documents', 'd0000000-0000-0000-0000-000000000000/chat/g.jpg')`);
    await as(dan, "insert into chat_room_attachments (group_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,'d0000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-000000000000/chat/g.jpg','g.jpg','image/jpeg',3)", [msg.id]);
    const k = (await as(kid, "select name from storage.objects where name like '%g.jpg'")).length;
    const c = (await as(cat, "select name from storage.objects where name like '%g.jpg'")).length;
    const r = (await as(ann, "select 1 from chat_room_reactions where group_message_id=$1", [msg.id])).length;
    return (k === 1 && c === 0 && r === 1) || { k, c, r };
  });
  await check("Push and topic: Dan's group push reaches Ann, Kid, Ben not Dan/Cat; topic for members only", async () => {
    await db.exec(`update members set notification_prefs='{}' where full_name='Kid A'`);
    const t = (await as(dan, "select endpoint from chat_push_targets($1) order by 1", [`group:${g}`])).map((x) => x.endpoint.split("/").pop());
    const topicCat = (await as(cat, "select chat_topic_is_mine($1) v", [`group:${g}`]))[0].v;
    const topicBen = (await as(ben, "select chat_topic_is_mine($1) v", [`group:${g}`]))[0].v;
    return (JSON.stringify(t) === '["Ann A","Ben B","Kid A"]' && !topicCat && topicBen) || { t, topicCat, topicBen };
  });
  await check("Unread for group counts for Ben", async () => {
    const r = Object.fromEntries((await as(ben, "select thread, unread from my_chat_unread()")).map((x) => [x.thread, Number(x.unread)]));
    return r[`group:${g}`] === 1 || r;
  });
  // 20261008090000 reads only the viewer's own groups and the last 14 days;
  // these pin that the counts stay what they were.
  await check("Unread: Cat, not in the group, counts nothing for it", async () => {
    const r = (await as(cat, "select thread, unread from my_chat_unread()")).filter((x) => x.thread === `group:${g}`);
    return r.length === 0 || r;
  });
  await check("Unread: a group message older than 14 days is not counted", async () => {
    await db.query("update chat_group_messages set created_at = now() - interval '15 days' where id = $1", [msg.id]);
    const r = (await as(ben, "select thread, unread from my_chat_unread()")).filter((x) => x.thread === `group:${g}`);
    await db.query("update chat_group_messages set created_at = now() where id = $1", [msg.id]);
    return r.length === 0 || r;
  });
  // Announcements
  let n;
  await check("Announcement channel: only admins post", async () => {
    n = (await as(ann, "select create_chat_group('Family news', true, $1) id", [[P("b1")]]))[0].id;
    const benBlocked = await refused(() => as(ben, "insert into chat_group_messages (group_id, body) values ($1,'x')", [n]));
    await as(ann, "insert into chat_group_messages (group_id, body) values ($1,'Reunion on Dec 20')", [n]);
    return benBlocked === true && (await as(ben, "select 1 from chat_group_messages where group_id=$1", [n])).length === 1;
  });
  await check("Ann makes Ben admin; Ben can then post", async () => {
    await as(ann, "select set_chat_group_admin($1,$2,true)", [n, P("b1")]);
    return !!(await as(ben, "insert into chat_group_messages (group_id, body) values ($1,'ok') returning id", [n]))[0].id;
  });
  await check("Leaving: Dan leaves Cousins, reads nothing after", async () => {
    await as(dan, "select remove_chat_group_member($1,$2)", [g, P("d1")]);
    return (await as(dan, "select * from chat_group_messages where group_id=$1", [g])).length === 0;
  });
  await check("Last admin leaves: admin passes to longest member", async () => {
    await as(ann, "select remove_chat_group_member($1,$2)", [g, P("a1")]);
    const r = await as(kid, "select full_name, role from group_members_of($1) where role='admin'", [g]);
    return r.length === 1 || r;
  });
  await check("Direct insert into groups/members refused", async () =>
    (await refused(() => as(cat, "insert into chat_groups (name) values ('x')"))) === true &&
    (await refused(() => as(cat, "insert into chat_group_members (group_id, person_id) values ($1,$2)", [g, P("c1")]))) === true);
}
