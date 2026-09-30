export default async function ({ db, check, refused }) {
  await check("transcript columns exist and cap at 5000", async () => {
    await db.exec("insert into family_message_attachments (family_id) values (gen_random_uuid())");
    await db.exec("update family_message_attachments set transcript = 'hello'");
    return refused(() => db.query("update family_message_attachments set transcript = repeat('x', 5001)"));
  });
  await check("room attachments transcript column", async () => (await db.query("select column_name from information_schema.columns where table_name='chat_room_attachments' and column_name='transcript'")).rows.length === 1);
}
