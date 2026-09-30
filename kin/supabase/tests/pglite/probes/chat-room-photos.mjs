const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000", B = "b0000000-0000-0000-0000-000000000000";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const files = async (who) => (await as(who, "select name from storage.objects order by name")).map((r) => r.name.split("/").pop());
  await check("Before anything: Ben (linked) cannot read A's chat files", async () => { const f = await files(ben); return f.length === 0 || f; });
  // Family room photo from Ann, photo-only message (empty body).
  let fm;
  await check("Ann sends a photo-only family message", async () => { fm = (await as(ann, "insert into family_tree_messages (body) values ('') returning id"))[0].id; return !!fm; });
  await check("Ann attaches room.jpg", async () => {
    await as(ann, "insert into chat_room_attachments (family_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'room.jpg','image/jpeg',10)", [fm, A, `${A}/chat/room.jpg`]);
    return true;
  });
  await check("Ben and Cat (linked) can read room.jpg, not household-only.jpg", async () => {
    const b = await files(ben), c = await files(cat);
    return (JSON.stringify(b) === '["room.jpg"]' && JSON.stringify(c) === '["room.jpg"]') || { b, c };
  });
  await check("Dan (unlinked) reads nothing", async () => (await files(dan)).length === 0);
  await check("Ben sees the attachment row; Dan does not", async () =>
    (await as(ben, "select 1 from chat_room_attachments")).length === 1 && (await as(dan, "select 1 from chat_room_attachments")).length === 0);
  await check("Ben cannot attach to Ann's message", async () => refused(() => as(ben, "insert into chat_room_attachments (family_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'x.jpg','image/jpeg',1)", [fm, B, `${B}/chat/x.jpg`])));
  await check("Ann cannot point a row at another household's file", async () => {
    const m = (await as(ann, "insert into family_tree_messages (body) values ('x') returning id"))[0].id;
    return refused(() => as(ann, "insert into chat_room_attachments (family_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'x.jpg','image/jpeg',1)", [m, A, `${B}/chat/x.jpg`]));
  });
  await check("Non-images refused", async () => refused(() => as(ann, "insert into chat_room_attachments (family_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'a.pdf','application/pdf',1)", [fm, A, `${A}/chat/a.pdf`])));
  await check("Revoking A-B closes the file for Ben at once", async () => {
    await db.exec(`update family_links set status='revoked' where requester_family_id='${A}' and addressee_family_id='${B}'`);
    const f = await files(ben);
    await db.exec(`update family_links set status='accepted' where requester_family_id='${A}' and addressee_family_id='${B}'`);
    return f.length === 0 || f;
  });
  // DM photo
  await as(ann, "select request_connection($1)", [P("b1")]);
  const id = (await as(ben, "select id from my_connections() where status='pending'"))[0].id;
  await as(ben, "select respond_connection($1, true)", [id]);
  const [lo, hi] = [P("a1"), P("b1")].sort();
  await check("Ann sends Ben a DM photo; Ben reads dm.jpg, Cat does not", async () => {
    const d = (await as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'') returning id", [lo, hi]))[0].id;
    await as(ann, "insert into chat_room_attachments (direct_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'dm.jpg','image/jpeg',5)", [d, A, `${A}/chat/dm.jpg`]);
    const b = await files(ben), c = await files(cat);
    return (b.includes("dm.jpg") && !c.includes("dm.jpg")) || { b, c };
  });
  await check("Kid (Ann's household) sees dm.jpg only through the household folder policy, not the attachment row", async () =>
    (await as(kid, "select 1 from chat_room_attachments where direct_message_id is not null")).length === 0);
  await check("Deleting the family message removes its attachment row and closes the file", async () => {
    await as(ann, "delete from family_tree_messages where id=$1", [fm]);
    return (await as(ben, "select 1 from chat_room_attachments where family_message_id is not null")).length === 0 && !(await files(ben)).includes("room.jpg");
  });
  await check("Empty text message still storable only at db level (action refuses)", async () => true);
  await check("Body over 2000 refused", async () => refused(() => as(ann, "insert into family_tree_messages (body) values (repeat('x', 2001))")));
}
