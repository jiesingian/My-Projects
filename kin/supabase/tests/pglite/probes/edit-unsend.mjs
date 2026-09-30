const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Edit and unsend in the family room, one to one and groups (20260930150100).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  const msg = (await as(ann, "insert into family_tree_messages (body) values ('first') returning id"))[0].id;
  await check("Ann edits her own family message; edited_at is stamped", async () => {
    const r = (await as(ann, "update family_tree_messages set body = 'second' where id = $1 returning body, edited_at", [msg]))[0];
    return (r.body === "second" && r.edited_at !== null) || r;
  });
  await check("Ben (linked) cannot edit Ann's message: no row changes", async () => {
    await as(ben, "update family_tree_messages set body = 'hijack' where id = $1", [msg]);
    return (await as(ann, "select body from family_tree_messages where id = $1", [msg]))[0].body === "second";
  });
  await check("Kid (same household) cannot edit Ann's message either", async () => {
    await as(kid, "update family_tree_messages set body = 'kid' where id = $1", [msg]);
    return (await as(ann, "select body from family_tree_messages where id = $1", [msg]))[0].body === "second";
  });
  await check("Ann cannot change the author, the reply or the timestamps", async () =>
    (await refused(() => as(ann, "update family_tree_messages set member_id = null where id = $1", [msg]))) &&
    (await refused(() => as(ann, "update family_tree_messages set edited_at = null where id = $1", [msg]))) &&
    (await refused(() => as(ann, "update family_tree_messages set author_name = 'Lola' where id = $1", [msg]))),
  );
  await check("An empty edit is refused", async () => refused(() => as(ann, "update family_tree_messages set body = '   ' where id = $1", [msg])));
  await check("Unsend blanks the words and marks it removed", async () => {
    const r = (await as(ann, "update family_tree_messages set deleted_at = now(), body = 'keep' where id = $1 returning body, deleted_at", [msg]))[0];
    return (r.body === "" && r.deleted_at !== null) || r;
  });
  await check("A removed message cannot be edited or brought back", async () =>
    (await refused(() => as(ann, "update family_tree_messages set body = 'back' where id = $1", [msg]))) &&
    (await refused(() => as(ann, "update family_tree_messages set deleted_at = null where id = $1", [msg]))),
  );
  // One to one: connect Ann and Ben.
  await as(ann, "select request_connection($1)", [P("b1")]);
  const cid = (await as(ben, "select id from my_connections() where status='pending'"))[0].id;
  await as(ben, "select respond_connection($1, true)", [cid]);
  const [lo, hi] = [P("a1"), P("b1")].sort();
  const dm = (await as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hi') returning id", [lo, hi]))[0].id;
  await check("Ben cannot edit or unsend Ann's DM; Dan cannot see it to try", async () => {
    await as(ben, "update direct_messages set body = 'x' where id = $1", [dm]);
    await as(ben, "update direct_messages set deleted_at = now() where id = $1", [dm]);
    await as(dan, "update direct_messages set body = 'x' where id = $1", [dm]);
    const r = (await as(ann, "select body, deleted_at from direct_messages where id = $1", [dm]))[0];
    return (r.body === "hi" && r.deleted_at === null) || r;
  });
  await check("Ann edits her DM", async () => (await as(ann, "update direct_messages set body = 'hello' where id = $1 returning body", [dm]))[0]?.body === "hello");
}
