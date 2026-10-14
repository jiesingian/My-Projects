// Stories on the tree (20261014204000): the household's own, added by its
// grown-ups and teens, changed only by whoever added one, deleted by them or
// a grown-up; files only in the household's stories folder; and a person
// taken off the tree takes their stories with them.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const LOLA = "f1000000-0000-0000-0000-0000000000a1";
const LOLO = "f1000000-0000-0000-0000-0000000000a2";
const TITO = "f1000000-0000-0000-0000-0000000000a3";
const BENS = "f1000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2");
  await db.exec(`
    insert into family_tree_people (id, family_id, full_name) values
      ('${LOLA}', '${A}', 'Lola Remedios'), ('${LOLO}', '${A}', 'Lolo Ben'), ('${TITO}', '${A}', 'Tito Jun'), ('${BENS}', '${B}', 'Lola ni Ben');
    insert into storage.objects (bucket_id, name) values ('documents', '${A}/stories/lola.m4a');
  `);

  const add = (who, fields) => {
    const f = { family: A, person: LOLA, author: M("a1"), teller: null, tellerName: null, ...fields };
    return as(
      who,
      "insert into tree_person_stories (family_id, person_id, title, created_by, told_by_member_id, told_by_name, happened_on, happened_precision) values ($1, $2, $3, $4, $5, $6, '1975-01-01', 'year') returning id",
      [f.family, f.person, f.title ?? "How Lola came to Manila", f.author, f.teller, f.tellerName],
    );
  };
  const addFile = (who, story, path, family = A) =>
    as(who, "insert into tree_person_story_files (story_id, family_id, storage_path, mime_type, file_name) values ($1, $2, $3, 'audio/mp4', 'Lola.m4a') returning id", [story, family, path]);
  const sees = async (who, id) => (await as(who, "select 1 from tree_person_stories where id = $1", [id])).length === 1;
  const seesFile = async (who, id) => (await as(who, "select 1 from tree_person_story_files where id = $1", [id])).length === 1;
  const reads = async (who, name) => (await as(who, "select 1 from storage.objects where bucket_id = 'documents' and name = $1", [name])).length === 1;
  const left = async (id) => (await db.query("select count(*)::int as n from tree_person_stories where id = $1", [id])).rows[0].n === 1;

  let annStory, kidStory, fileId;
  await check("A grown-up adds a story about a relative who is only a name", async () => {
    annStory = (await add(ann, { tellerName: "Lolo Ben, told to Mia" }))[0]?.id;
    return !!annStory;
  });
  await check("The household sees it: the teen and the other grown-up", async () => (await sees(kid, annStory)) && (await sees(abe, annStory)));
  await check("A linked household does not see it, sharing or not", async () => !(await sees(ben, annStory)) && !(await sees(cat, annStory)));
  await check("A stranger does not see it", async () => !(await sees(dan, annStory)) && !(await sees(dee, annStory)));

  await check("A teen with a login adds one of their own", async () => {
    kidStory = (await add(kid, { author: M("a2"), title: "Lolo's jeepney", teller: M("a1") }))[0]?.id;
    return !!kidStory;
  });
  await check("A child in kid view cannot add one", async () => {
    await db.exec(`update members set kid_view = true where id = '${M("a2")}'`);
    const r = await refused(() => add(kid, { author: M("a2") }));
    await db.exec(`update members set kid_view = false where id = '${M("a2")}'`);
    return r;
  });
  await check("Nobody adds a story in someone else's name", async () => refused(() => add(kid, { author: M("a1") })));
  await check("Another household cannot add one to this tree", async () => refused(() => add(ben, { author: M("b1") })));
  await check("Nor put this household's person under its own", async () => refused(() => add(ben, { family: B, author: M("b1") })));
  await check("A story cannot hang on another household's person", async () => refused(() => add(ann, { person: BENS })));
  await check("Who told it must be in the household", async () => refused(() => add(ann, { teller: M("b1") })));

  await check("Only whoever added it may change it: not the teen", async () => {
    await as(kid, "update tree_person_stories set title = 'Changed' where id = $1", [annStory]);
    return (await db.query("select title from tree_person_stories where id = $1", [annStory])).rows[0].title === "How Lola came to Manila";
  });
  await check("Nor another grown-up", async () => {
    await as(abe, "update tree_person_stories set title = 'Changed' where id = $1", [annStory]);
    return (await db.query("select title from tree_person_stories where id = $1", [annStory])).rows[0].title === "How Lola came to Manila";
  });
  await check("Nor a stranger", async () => {
    await as(dan, "update tree_person_stories set title = 'Changed' where id = $1", [annStory]);
    return (await db.query("select title from tree_person_stories where id = $1", [annStory])).rows[0].title === "How Lola came to Manila";
  });
  await check("Whoever added it may change it", async () => (await as(ann, "update tree_person_stories set title = 'How Lola came to Manila, 1975' where id = $1 returning id", [annStory])).length === 1);
  await check("And cannot hand it to someone else", async () => refused(() => as(ann, "update tree_person_stories set created_by = $2 where id = $1", [annStory, M("a4")])));
  await check("Nor move it to another household", async () => refused(() => as(ann, "update tree_person_stories set family_id = $2 where id = $1", [annStory, B])));

  await check("Its writer adds a recording in the household's stories folder", async () => {
    fileId = (await addFile(ann, annStory, `${A}/stories/lola.m4a`))[0]?.id;
    return !!fileId;
  });
  await check("The household sees the file and can read it", async () => (await seesFile(kid, fileId)) && (await reads(kid, `${A}/stories/lola.m4a`)));
  await check("Another household sees neither the row nor the file", async () => !(await seesFile(ben, fileId)) && !(await reads(ben, `${A}/stories/lola.m4a`)) && !(await reads(dan, `${A}/stories/lola.m4a`)));
  await check("A file cannot point into another household's folder", async () => refused(() => addFile(ann, annStory, `${B}/stories/x.m4a`)));
  await check("Nor anywhere outside the stories folder", async () => refused(() => addFile(ann, annStory, `${A}/chat/x.m4a`)));
  await check("Nor climb out of it", async () => refused(() => addFile(ann, annStory, `${A}/stories/../../${B}/x.m4a`)));
  await check("Nor claim another household on the row", async () => refused(() => addFile(ann, annStory, `${B}/stories/x.m4a`, B)));
  await check("Someone else in the household cannot add files to a story that isn't theirs", async () => refused(() => addFile(kid, annStory, `${A}/stories/kid.m4a`)));
  await check("Another household cannot upload into this household's folder", async () =>
    refused(() => as(ben, "insert into storage.objects (bucket_id, name) values ('documents', $1)", [`${A}/stories/sneaky.m4a`])));
  await check("Another household cannot take a file off", async () => {
    await as(dan, "delete from tree_person_story_files where id = $1", [fileId]);
    return seesFile(ann, fileId);
  });
  await check("Nor the teen, on a story that isn't theirs", async () => {
    await as(kid, "delete from tree_person_story_files where id = $1", [fileId]);
    return seesFile(ann, fileId);
  });

  // Attacks added in review: chaining, forged rows, people who left, and the
  // functions themselves.
  await check("Two stories cannot point at one stored file", async () => {
    const other = (await add(ann, { person: LOLO, title: "Another" }))[0].id;
    const r = await refused(() => addFile(ann, other, `${A}/stories/lola.m4a`));
    await db.query("delete from tree_person_stories where id = $1", [other]);
    return r;
  });
  await check("Another household cannot hang a file on this household's story, from its own folder", async () =>
    refused(() => addFile(ben, annStory, `${B}/stories/x.m4a`, B)));
  await check("Nor on it with this household's id forged on the row", async () => refused(() => addFile(ben, annStory, `${A}/stories/x.m4a`)));
  await check("Nobody can repoint a file row once it is kept (no update policy)", async () => {
    await as(ann, "update tree_person_story_files set storage_path = $2 where id = $1", [fileId, `${A}/stories/other.m4a`]).catch(() => null);
    return (await db.query("select storage_path from tree_person_story_files where id = $1", [fileId])).rows[0].storage_path === `${A}/stories/lola.m4a`;
  });
  await check("A teen cannot move their story onto another household's person", async () =>
    refused(() => as(kid, "update tree_person_stories set person_id = $2 where id = $1", [kidStory, BENS])));
  await check("Nor name a teller from another household on it", async () =>
    refused(() => as(kid, "update tree_person_stories set told_by_member_id = $2 where id = $1", [kidStory, M("b1")])));
  await check("A teen put in kid view can no longer change their story", async () => {
    await db.exec(`update members set kid_view = true where id = '${M("a2")}'`);
    const r = await refused(() => as(kid, "update tree_person_stories set title = 'In kid view' where id = $1", [kidStory]));
    await db.exec(`update members set kid_view = false where id = '${M("a2")}'`);
    return r;
  });
  await check("A grown-up who has left the household sees nothing and adds nothing", async () => {
    await db.exec(`update members set status = 'removed' where id = '${M("a4")}'`);
    const seen = await sees(abe, annStory);
    const r = await refused(() => add(abe, { author: M("a4") }));
    await db.exec(`update members set status = 'active' where id = '${M("a4")}'`);
    return !seen && r === true;
  });
  await check("A grown-up who has left cannot delete a story", async () => {
    await db.exec(`update members set status = 'removed' where id = '${M("a4")}'`);
    await as(abe, "delete from tree_person_stories where id = $1", [annStory]);
    await db.exec(`update members set status = 'active' where id = '${M("a4")}'`);
    return left(annStory);
  });
  await check("A story on a person already taken off the tree is refused", async () => refused(() => add(ann, { person: "f1000000-0000-0000-0000-0000000000ff" })));
  await check("Signed-out callers cannot run the story functions", async () => {
    const q = await db.query(`select has_function_privilege('anon', 'public.can_add_tree_stories()', 'execute') as a,
      has_function_privilege('anon', 'public.tree_story_fits(uuid, uuid, uuid)', 'execute') as b,
      has_function_privilege('anon', 'public.family_tree_people_keep_stories()', 'execute') as c`);
    const r = q.rows[0];
    return !r.a && !r.b && !r.c;
  });
  await check("The definer functions keep an empty search_path", async () =>
    (await db.query(`select count(*)::int as n from pg_proc where proname in ('can_add_tree_stories', 'family_tree_people_keep_stories', 'tree_story_fits')
      and not ('search_path=""' = any(proconfig))`)).rows[0].n === 0);
  await check("Someone signed in but in no household may not add", async () => (await as(U("ff"), "select public.can_add_tree_stories() as ok"))[0].ok === false);

  await check("The teen cannot delete a grown-up's story", async () => {
    await as(kid, "delete from tree_person_stories where id = $1", [annStory]);
    return left(annStory);
  });
  await check("A stranger cannot delete it", async () => {
    await as(dan, "delete from tree_person_stories where id = $1", [annStory]);
    await as(ben, "delete from tree_person_stories where id = $1", [annStory]);
    return left(annStory);
  });
  await check("A grown-up may delete anyone's story", async () => {
    await as(abe, "delete from tree_person_stories where id = $1", [kidStory]);
    return !(await left(kidStory));
  });
  await check("The teen may delete their own", async () => {
    const id = (await add(kid, { author: M("a2"), person: LOLO }))[0].id;
    await as(kid, "delete from tree_person_stories where id = $1", [id]);
    return !(await left(id));
  });

  await check("Stories are Kin Free: no Plus guard on either table", async () =>
    (await db.query(`select count(*)::int as n from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid in ('public.tree_person_stories'::regclass, 'public.tree_person_story_files'::regclass) and p.proname = 'require_kin_plus'`)).rows[0].n === 0);

  await check("A child cannot take someone with stories off the tree", async () => refused(() => as(kid, "delete from family_tree_people where id = $1", [LOLA]), "grown-up"));
  await check("A child can still take off someone with none", async () => {
    await as(kid, "delete from family_tree_people where id = $1", [TITO]);
    return (await db.query("select count(*)::int as n from family_tree_people where id = $1", [TITO])).rows[0].n === 0;
  });
  await check("A grown-up taking them off takes their stories and files with them", async () => {
    await as(ann, "delete from family_tree_people where id = $1", [LOLA]);
    const s = (await db.query("select count(*)::int as n from tree_person_stories where person_id = $1", [LOLA])).rows[0].n;
    const f = (await db.query("select count(*)::int as n from tree_person_story_files where id = $1", [fileId])).rows[0].n;
    return s === 0 && f === 0;
  });
}
