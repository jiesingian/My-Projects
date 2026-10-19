// Stories on the tree shared with linked households (20261019130000): only
// a story its writer shared, only to a linked household that has matched the
// story's person, read only, files included; and who hears about a new one.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
const LOLA = "f1000000-0000-0000-0000-0000000000a1";
const LOLO = "f1000000-0000-0000-0000-0000000000a2";
const BLOLA = "f1000000-0000-0000-0000-0000000000b1";
const CLOLA = "f1000000-0000-0000-0000-0000000000c1";
const DLOLA = "f1000000-0000-0000-0000-0000000000d1";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  await db.exec(`
    insert into family_tree_people (id, family_id, full_name) values
      ('${LOLA}', '${A}', 'Lola Remedios'), ('${LOLO}', '${A}', 'Lolo Ben'),
      ('${BLOLA}', '${B}', 'Lola Remy'), ('${CLOLA}', '${C}', 'Lola Remedios'), ('${DLOLA}', '${D}', 'Lola R');
    -- A offered Lola to B, who matched her with their own; C has her too but
    -- never matched; D is not linked, with a match row forged in anyway.
    insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id, to_person_id, status) values
      ('${A}', '${LOLA}', '${B}', '${BLOLA}', 'accepted'),
      ('${A}', '${LOLA}', '${D}', '${DLOLA}', 'accepted');
    insert into storage.objects (bucket_id, name) values
      ('documents', '${A}/stories/shared.m4a'), ('documents', '${A}/stories/private.m4a'), ('documents', '${A}/docs/passport.pdf');
    delete from push_subscriptions;
    insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values
      ('${M("a1")}', '${A}', 'https://push/ann', 'k', 'a'), ('${M("a2")}', '${A}', 'https://push/kid', 'k', 'a'),
      ('${M("b1")}', '${B}', 'https://push/ben', 'k', 'a'), ('${M("c1")}', '${C}', 'https://push/cat', 'k', 'a'),
      ('${M("d1")}', '${D}', 'https://push/dan', 'k', 'a');
  `);

  const add = (who, author, fields = {}) =>
    as(
      who,
      "insert into tree_person_stories (family_id, person_id, title, created_by, told_by_member_id, shared_at) values ($1, $2, $3, $4, $5, $6) returning id, shared_at",
      [A, fields.person ?? LOLA, fields.title ?? "How Lola came to Manila", author, fields.teller ?? null, fields.shared ?? null],
    );
  const addFile = (who, story, path) =>
    as(who, "insert into tree_person_story_files (story_id, family_id, storage_path, mime_type, file_name) values ($1, $2, $3, 'audio/mp4', 'Lola.m4a') returning id", [story, A, path]);
  const linked = async (who, person) => (await as(who, "select * from linked_tree_stories($1)", [person])).map((r) => r.id);
  const linkedFiles = async (who, person) => (await as(who, "select * from linked_tree_story_files($1)", [person])).map((r) => r.storage_path);
  const reads = async (who, name) => (await as(who, "select 1 from storage.objects where bucket_id = 'documents' and name = $1", [name])).length === 1;
  const targets = async (who, story, isNew = true) => (await as(who, "select endpoint, person_id from tree_story_push_targets($1, $2)", [story, isNew])).map((r) => `${r.endpoint}@${r.person_id}`).sort();

  let shared, privateStory;
  await check("A story is the household's own unless its writer shares it", async () => {
    privateStory = (await add(ann, M("a1"), { title: "Private" }))[0].id;
    await addFile(ann, privateStory, `${A}/stories/private.m4a`);
    return (await db.query("select shared_at from tree_person_stories where id = $1", [privateStory])).rows[0].shared_at === null;
  });
  await check("The writer shares one; the server dates the share, not the writer", async () => {
    const r = (await add(ann, M("a1"), { shared: "2001-01-01T00:00:00Z", teller: M("a2") }))[0];
    shared = r.id;
    await addFile(ann, shared, `${A}/stories/shared.m4a`);
    return new Date(r.shared_at).getFullYear() > 2001;
  });

  await check("The matched linked household sees the shared story on its own Lola", async () => {
    const ids = await linked(ben, BLOLA);
    return ids.length === 1 && ids[0] === shared;
  });
  await check("With who told it and who added it, by name, and the household it came from", async () => {
    const r = (await as(ben, "select * from linked_tree_stories($1)", [BLOLA]))[0];
    return r.teller === "Kid A" && r.created_by_name === "Ann A" && r.family_name === "House A";
  });
  await check("And its file, which it can read to sign", async () =>
    JSON.stringify(await linkedFiles(ben, BLOLA)) === JSON.stringify([`${A}/stories/shared.m4a`]) && (await reads(ben, `${A}/stories/shared.m4a`)));
  await check("Not the story that was not shared, nor its file", async () =>
    !(await linked(ben, BLOLA)).includes(privateStory) && !(await reads(ben, `${A}/stories/private.m4a`)));
  await check("Nothing else in the household's folder", async () => !(await reads(ben, `${A}/docs/passport.pdf`)));
  await check("Not through the table itself (no select policy crosses)", async () =>
    (await as(ben, "select 1 from tree_person_stories where id = $1", [shared])).length === 0 &&
    (await as(ben, "select 1 from tree_person_story_files where story_id = $1", [shared])).length === 0);
  await check("Asked about a person who is not on its own tree, it gets nothing", async () => (await linked(ben, LOLA)).length === 0 && (await linked(ben, CLOLA)).length === 0);
  await check("A linked household that never matched Lola sees nothing", async () =>
    (await linked(cat, CLOLA)).length === 0 && !(await reads(cat, `${A}/stories/shared.m4a`)));
  await check("A household that is not linked sees nothing, even with a match row", async () =>
    (await linked(dan, DLOLA)).length === 0 && !(await reads(dan, `${A}/stories/shared.m4a`)));
  await check("The writer's own household reads it as before", async () =>
    (await as(kid, "select 1 from tree_person_stories where id = $1", [shared])).length === 1 && (await reads(kid, `${A}/stories/shared.m4a`)));
  await check("It works the other way round too: B's shared story reaches A", async () => {
    const id = (await as(ben, "insert into tree_person_stories (family_id, person_id, title, created_by, shared_at) values ($1, $2, 'Remy at the market', $3, now()) returning id", [B, BLOLA, M("b1")]))[0].id;
    const r = (await linked(ann, LOLA)).includes(id);
    await db.query("delete from tree_person_stories where id = $1", [id]);
    return r;
  });

  await check("The linked household cannot change, delete or add files to it", async () => {
    await as(ben, "update tree_person_stories set title = 'Changed', shared_at = null where id = $1", [shared]);
    await as(ben, "delete from tree_person_stories where id = $1", [shared]);
    const kept = (await db.query("select title from tree_person_stories where id = $1", [shared])).rows[0]?.title === "How Lola came to Manila";
    const r = await refused(() => as(ben, "insert into tree_person_story_files (story_id, family_id, storage_path, mime_type) values ($1, $2, $3, 'audio/mp4')", [shared, A, `${A}/stories/b.m4a`]));
    return kept && r === true;
  });
  await check("Nor upload into the household's stories folder", async () =>
    refused(() => as(ben, "insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${A}/stories/sneaky.m4a`])));
  await check("Nobody else can share a story for its writer", async () => {
    await as(kid, "update tree_person_stories set shared_at = now() where id = $1", [privateStory]);
    return (await db.query("select shared_at from tree_person_stories where id = $1", [privateStory])).rows[0].shared_at === null;
  });
  await check("Editing a shared story keeps when it was shared", async () => {
    const before = (await db.query("select shared_at from tree_person_stories where id = $1", [shared])).rows[0].shared_at;
    await as(ann, "update tree_person_stories set title = 'How Lola came to Manila', shared_at = '2099-01-01' where id = $1", [shared]);
    const after = (await db.query("select shared_at from tree_person_stories where id = $1", [shared])).rows[0].shared_at;
    return +before === +after;
  });

  await check("A new shared story reaches the rest of the household and the matched household, each at its own Lola", async () => {
    const t = await targets(ann, shared);
    return JSON.stringify(t) === JSON.stringify([`https://push/ben@${BLOLA}`, `https://push/kid@${LOLA}`].sort());
  });
  await check("A new private one reaches only the household", async () => JSON.stringify(await targets(ann, privateStory)) === JSON.stringify([`https://push/kid@${LOLA}`]));
  await check("Shared on an edit: only the linked household hears", async () => JSON.stringify(await targets(ann, shared, false)) === JSON.stringify([`https://push/ben@${BLOLA}`]));
  await check("A person's journal switch is honoured", async () => {
    await db.exec(`update members set notification_prefs = '{"journal": false}' where id = '${M("b1")}'`);
    const t = await targets(ann, shared);
    await db.exec(`update members set notification_prefs = '{}' where id = '${M("b1")}'`);
    return !t.some((x) => x.startsWith("https://push/ben"));
  });
  await check("Only the story's writer can ask who to tell", async () => (await targets(kid, shared)).length === 0 && (await targets(ben, shared)).length === 0);
  await check("Not once the story is old: no ringing the family on demand", async () => {
    await db.exec(`alter table tree_person_stories disable trigger tree_person_stories_share_stamp`);
    await db.query("update tree_person_stories set created_at = now() - interval '1 hour', shared_at = now() - interval '1 hour' where id = $1", [shared]);
    await db.exec(`alter table tree_person_stories enable trigger tree_person_stories_share_stamp`);
    return (await targets(ann, shared)).length === 0;
  });

  await check("Unsharing closes it at once", async () => {
    await as(ann, "update tree_person_stories set shared_at = null where id = $1", [shared]);
    const r = (await linked(ben, BLOLA)).length === 0 && !(await reads(ben, `${A}/stories/shared.m4a`));
    await as(ann, "update tree_person_stories set shared_at = now() where id = $1", [shared]);
    return r && (await linked(ben, BLOLA)).length === 1;
  });
  await check("Revoking the link closes it", async () => {
    await db.exec(`update family_links set status = 'revoked' where requester_family_id = '${A}' and addressee_family_id = '${B}'`);
    const r = (await linked(ben, BLOLA)).length === 0 && !(await reads(ben, `${A}/stories/shared.m4a`));
    await db.exec(`update family_links set status = 'accepted' where requester_family_id = '${A}' and addressee_family_id = '${B}'`);
    return r;
  });
  await check("Withdrawing the match closes it", async () => {
    await db.exec(`delete from family_tree_matches where offer_person_id = '${LOLA}' and to_family_id = '${B}'`);
    return (await linked(ben, BLOLA)).length === 0 && !(await reads(ben, `${A}/stories/shared.m4a`));
  });

  await check("Signed-out callers cannot run the functions", async () => {
    const q = await db.query(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) as any
      from pg_proc p where p.proname in ('tree_story_shared_with_me', 'linked_tree_stories', 'linked_tree_story_files', 'tree_story_object_shared_with_me', 'tree_story_push_targets', 'tree_person_stories_share_stamp')`);
    return q.rows[0].any === false;
  });
  await check("The functions keep an empty search_path", async () =>
    (await db.query(`select count(*)::int as n from pg_proc where proname in ('tree_story_shared_with_me', 'linked_tree_stories', 'linked_tree_story_files', 'tree_story_object_shared_with_me', 'tree_story_push_targets', 'tree_person_stories_share_stamp')
      and not ('search_path=""' = any(proconfig))`)).rows[0].n === 0);
}
