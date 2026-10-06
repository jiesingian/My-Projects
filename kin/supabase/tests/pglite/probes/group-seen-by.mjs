const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// "Seen by" in groups (20260930170000).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), dan = U("d1");
  const g = (await as(ann, "select create_chat_group('Home', false, $1) id", [[P("a2")]]))[0].id;
  await check("Before Kid opens the group, Ann sees nobody", async () => (await as(ann, "select * from group_seen_by($1)", [g])).length === 0);
  await as(kid, "insert into chat_reads (person_id, thread) values ($1, $2)", [P("a2"), `group:${g}`]);
  await check("After Kid opens it, Ann sees Kid's first name and when", async () => {
    const r = await as(ann, "select first_name, last_read_at from group_seen_by($1)", [g]);
    return (r.length === 1 && r[0].first_name === "Kid" && r[0].last_read_at !== null) || r;
  });
  await check("Kid does not see himself", async () => (await as(kid, "select * from group_seen_by($1)", [g])).length === 0);
  await check("Dan (not a member) learns nothing", async () => (await as(dan, "select * from group_seen_by($1)", [g])).length === 0);
  await check("Dan cannot forge Kid's read marker", async () =>
    refused(() => as(dan, "insert into chat_reads (person_id, thread) values ($1, $2)", [P("a2"), `group:${g}`])));
}
