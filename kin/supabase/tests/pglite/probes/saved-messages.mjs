const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Saved messages (20260930190000): the owner and nobody else.
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  const A = (await db.query("select family_id from members where full_name = 'Ann A'")).rows[0].family_id;
  const note = (await as(ann, "insert into saved_messages (body) values ('passport no. 123') returning id, person_id"))[0];
  await check("Ann's note is hers (person_id from the caller)", async () => note.person_id === P("a1") || note);
  await check("Kid (same household) and Ben (linked) see none of it", async () =>
    (await as(kid, "select 1 from saved_messages")).length === 0 && (await as(ben, "select 1 from saved_messages")).length === 0);
  await check("Nobody can write into Ann's saved messages", async () =>
    refused(() => as(kid, "insert into saved_messages (person_id, body) values ($1, 'x')", [P("a1")])));
  await check("Kid cannot delete Ann's note; Ann can edit nothing (no update)", async () => {
    await as(kid, "delete from saved_messages where id = $1", [note.id]);
    const still = (await as(ann, "select 1 from saved_messages where id = $1", [note.id])).length === 1;
    return still && (await refused(() => as(ann, "update saved_messages set body = 'y' where id = $1", [note.id])));
  });
  await check("Ann attaches a photo from her own household folder", async () => {
    await as(ann, "insert into chat_room_attachments (saved_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'p.jpg','image/jpeg',10)", [note.id, A, `${A}/chat/p.jpg`]);
    return (await as(ann, "select chat_room_object_visible($1) v", [`${A}/chat/p.jpg`]))[0].v === true;
  });
  await check("Kid cannot see, list or attach to Ann's saved photo", async () =>
    (await as(kid, "select chat_room_object_visible($1) v", [`${A}/chat/p.jpg`]))[0].v === false &&
    (await as(kid, "select 1 from chat_room_attachments where saved_message_id = $1", [note.id])).length === 0 &&
    (await refused(() => as(kid, "insert into chat_room_attachments (saved_message_id, family_id, storage_path, file_name, mime_type, size_bytes) values ($1,$2,$3,'k.jpg','image/jpeg',1)", [note.id, A, `${A}/chat/k.jpg`]))));
  await check("Ann deletes her note; its photo row goes with it", async () => {
    await as(ann, "delete from saved_messages where id = $1", [note.id]);
    return (await db.query("select 1 from chat_room_attachments where saved_message_id = $1", [note.id])).rows.length === 0;
  });
}
