const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Pinning in the family room, one to one and groups (20260930160000).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const annMsg = (await as(ann, "insert into family_tree_messages (body) values ('from A') returning id"))[0].id;
  const benMsg = (await as(ben, "insert into family_tree_messages (body) values ('from B') returning id"))[0].id;
  await check("Ben (linked) pins Ann's family message; his first name travels on it", async () => {
    await as(ben, "select pin_chat_message('family', $1, true)", [annMsg]);
    const r = (await as(ann, "select pinned_at, pinned_by from family_tree_messages where id = $1", [annMsg]))[0];
    return (r.pinned_at !== null && r.pinned_by === "Ben") || r;
  });
  await check("Cat (not linked with B) cannot pin Ben's message; Dan cannot pin anything", async () =>
    (await refused(() => as(cat, "select pin_chat_message('family', $1, true)", [benMsg]))) &&
    (await refused(() => as(dan, "select pin_chat_message('family', $1, true)", [annMsg]))));
  await check("Nobody can write pinned_at or pinned_by directly", async () =>
    (await refused(() => as(ann, "update family_tree_messages set pinned_at = now() where id = $1", [annMsg]))) &&
    (await refused(() => as(ann, "update family_tree_messages set pinned_by = 'Lola' where id = $1", [annMsg]))));
  await check("Ann unpins it; pinning did not mark it edited", async () => {
    await as(ann, "select pin_chat_message('family', $1, false)", [annMsg]);
    const r = (await as(ann, "select pinned_at, pinned_by, edited_at from family_tree_messages where id = $1", [annMsg]))[0];
    return (r.pinned_at === null && r.pinned_by === null && r.edited_at === null) || r;
  });
  await check("A removed message cannot be pinned", async () => {
    const gone = (await as(ann, "insert into family_tree_messages (body) values ('bye') returning id"))[0].id;
    await as(ann, "update family_tree_messages set deleted_at = now() where id = $1", [gone]);
    return refused(() => as(ann, "select pin_chat_message('family', $1, true)", [gone]));
  });
  // One to one
  await as(ann, "select request_connection($1)", [P("b1")]);
  const cid = (await as(ben, "select id from my_connections() where status='pending'"))[0].id;
  await as(ben, "select respond_connection($1, true)", [cid]);
  const [lo, hi] = [P("a1"), P("b1")].sort();
  const dm = (await as(ann, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hi') returning id", [lo, hi]))[0].id;
  await check("Ben pins Ann's DM; Kid and Dan cannot", async () => {
    await as(ben, "select pin_chat_message('dm', $1, true)", [dm]);
    return (await refused(() => as(kid, "select pin_chat_message('dm', $1, false)", [dm]))) &&
      (await refused(() => as(dan, "select pin_chat_message('dm', $1, false)", [dm])));
  });
  // An announcement channel: Ann admin, Kid member.
  const ch = (await as(ann, "select create_chat_group('News', true, $1) id", [[P("a2")]]))[0].id;
  const post = (await as(ann, "insert into chat_group_messages (group_id, body) values ($1, 'notice') returning id", [ch]))[0].id;
  await check("In a channel only an admin pins: Kid refused, Ann allowed", async () =>
    (await refused(() => as(kid, "select pin_chat_message('group', $1, true)", [post]))) &&
    (await as(ann, "select pin_chat_message('group', $1, true)", [post]), true));
  await check("An unknown kind is refused", async () => refused(() => as(ann, "select pin_chat_message('household', $1, true)", [annMsg])));
}
