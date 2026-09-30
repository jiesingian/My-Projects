const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// @mentions (20260930180000): who gets "mentioned you", who gets the plain push.
export default async function ({ as, check, refused }) {
  const ann = U("a1"), ben = U("b1");
  const flags = async (who, thread, people) =>
    Object.fromEntries((await as(who, "select endpoint, mentioned from chat_push_targets_mentioning($1, $2)", [thread, people])).map((r) => [r.endpoint.split("/").pop(), r.mentioned]));
  await check("Ann names Ben in Family: Ben's device is flagged, the others plain", async () => {
    const f = await flags(ann, "family", [P("b1")]);
    return (f["Ben B"] === true && Object.entries(f).every(([k, v]) => k === "Ben B" || v === false)) || f;
  });
  await check("Naming Dan (a stranger) reaches no device of Dan's", async () => {
    const f = await flags(ann, "family", [P("d1")]);
    return !("Dan D" in f) || f;
  });
  await check("Ben mutes Family: named or not, nothing reaches him", async () => {
    await as(ben, "insert into chat_thread_prefs (person_id, thread, muted) values ($1, 'family', true)", [P("b1")]);
    const f = await flags(ann, "family", [P("b1")]);
    return !("Ben B" in f) || f;
  });
  await check("A message may name at most 20 people", async () =>
    refused(() => as(ann, "insert into family_tree_messages (body, mentions) values ('x', $1)", [Array.from({ length: 21 }, () => P("b1"))])));
}
