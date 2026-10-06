const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Polls in groups (20260930200000).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1");
  const g = (await as(ann, "select create_chat_group('Home', false, $1) id", [[P("a2")]]))[0].id;
  let msg;
  await check("Ann asks a poll in her group; the message is hers", async () => {
    msg = (await as(ann, "select create_group_poll($1, 'Dinner?', array['Adobo','Sinigang',' '], false) id", [g]))[0].id;
    const m = (await as(ann, "select sender_person_id, body from chat_group_messages where id = $1", [msg]))[0];
    const n = (await as(ann, "select count(*)::int n from group_poll_options o join group_polls p on p.id = o.poll_id where p.message_id = $1", [msg]))[0].n;
    return (m.sender_person_id === P("a1") && n === 2) || { m, n };
  });
  const poll = (await as(ann, "select id from group_polls where message_id = $1", [msg]))[0].id;
  const [adobo, sinigang] = (await as(ann, "select id from group_poll_options where poll_id = $1 order by position", [poll])).map((r) => r.id);
  await check("Dan (not a member) cannot ask, see or vote", async () =>
    (await refused(() => as(dan, "select create_group_poll($1, 'X', array['a','b'], false)", [g]))) &&
    (await as(dan, "select 1 from group_polls")).length === 0 &&
    (await refused(() => as(dan, "insert into group_poll_votes (poll_id, option_id) values ($1, $2)", [poll, adobo]))));
  await check("Kid votes; his first name travels on the vote", async () => {
    await as(kid, "insert into group_poll_votes (poll_id, option_id) values ($1, $2)", [poll, adobo]);
    return (await as(ann, "select voter_name from group_poll_votes"))[0]?.voter_name === "Kid";
  });
  await check("Single choice: Kid's second answer is refused", async () =>
    refused(() => as(kid, "insert into group_poll_votes (poll_id, option_id) values ($1, $2)", [poll, sinigang])));
  await check("Kid cannot vote as Ann", async () => {
    await as(kid, "insert into group_poll_votes (poll_id, option_id, person_id) values ($1, $2, $3)", [poll, sinigang, P("a1")]).catch(() => {});
    return (await as(ann, "select 1 from group_poll_votes where person_id = $1", [P("a1")])).length === 0;
  });
  await check("Ann cannot remove Kid's vote; nobody writes polls directly", async () => {
    await as(ann, "delete from group_poll_votes");
    const kept = (await as(kid, "select 1 from group_poll_votes")).length === 1;
    return kept && (await refused(() => as(ann, "insert into group_polls (message_id, group_id, question) values ($1, $2, 'x')", [msg, g])));
  });
  await check("A poll needs 2 to 10 answers and a question", async () =>
    (await refused(() => as(ann, "select create_group_poll($1, 'Q', array['only one'], false)", [g]))) &&
    (await refused(() => as(ann, "select create_group_poll($1, '  ', array['a','b'], false)", [g]))));
  const ch = (await as(ann, "select create_chat_group('News', true, $1) id", [[P("a2")]]))[0].id;
  await check("In a channel only an admin asks, but members vote", async () => {
    const asked = await refused(() => as(kid, "select create_group_poll($1, 'Q', array['a','b'], false)", [ch]));
    const m = (await as(ann, "select create_group_poll($1, 'Q', array['a','b'], true) id", [ch]))[0].id;
    const p = (await as(kid, "select id from group_polls where message_id = $1", [m]))[0].id;
    const o = (await as(kid, "select id from group_poll_options where poll_id = $1", [p])).map((r) => r.id);
    await as(kid, "insert into group_poll_votes (poll_id, option_id) values ($1, $2)", [p, o[0]]);
    await as(kid, "insert into group_poll_votes (poll_id, option_id) values ($1, $2)", [p, o[1]]);
    return asked && (await as(kid, "select 1 from group_poll_votes where poll_id = $1", [p])).length === 2;
  });
}
