// An entry's video (20261006100500): readable exactly where its entry is,
// made only by the entry's own household, and only from that household's
// folder or the maker's own.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const E = (s) => `e0000000-0000-0000-0000-0000000000${s}`;
const AV = `${A}/videos/v.mp4`, AP = `${A}/videos/v.jpg`;
const MINE = "person/00000000-0000-0000-0000-0000000000a1/videos/mine.mp4";
const MINEP = "person/00000000-0000-0000-0000-0000000000a1/videos/mine.jpg";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const add = (who, entry, fam, video, poster) =>
    as(who, "insert into journal_entry_videos (entry_id, family_id, storage_path, poster_path, mime_type, width, height, duration_seconds) values ($1, $2, $3, $4, 'video/mp4', 1280, 720, 30) returning entry_id", [entry, fam, video, poster]);
  const sees = async (who, entry) => (await as(who, "select 1 from journal_entry_videos where entry_id = $1", [entry])).length === 1;
  const reads = async (who, name) => (await as(who, "select 1 from storage.objects where bucket_id = 'journal' and name = $1", [name])).length === 1;

  await check("A grown-up keeps a video on a household entry", async () => (await add(ann, E("a1"), A, AV, AP)).length === 1);
  await check("Their household sees it", async () => sees(kid, E("a1")));
  await check("A stranger does not see it", async () => !(await sees(dan, E("a1"))));
  await check("A linked household does not see it before the entry is shared", async () => !(await sees(ben, E("a1"))) && !(await reads(ben, AV)));
  await db.exec(`update journal_entries set shared_at = now() where id = '${E("a1")}'`);
  await check("Once shared, the linked household sees the video and can read its files", async () => (await sees(ben, E("a1"))) && (await reads(ben, AV)) && (await reads(ben, AP)));
  await check("A stranger still cannot read the files", async () => !(await reads(dan, AV)) && !(await reads(dan, AP)));
  await check("Shared then taken back, the linked household loses it again", async () => {
    await db.exec(`update journal_entries set shared_at = null where id = '${E("a1")}'`);
    return !(await sees(ben, E("a1"))) && !(await reads(ben, AV)) && !(await reads(cat, AV));
  });

  await check("A Just-me video, kept in its writer's folder", async () => (await add(ann, E("a2"), A, MINE, MINEP)).length === 1);
  await check("The rest of the household cannot see a Just-me video, or read its files", async () => !(await sees(kid, E("a2"))) && !(await reads(kid, MINE)));
  await check("Nobody else in the household can put a video on someone's Just-me entry", async () => {
    await db.exec(`delete from journal_entry_videos where entry_id = '${E("a2")}'`);
    return refused(() => add(kid, E("a2"), A, `${A}/videos/v.mp4`, `${A}/videos/v.jpg`));
  });

  await check("Another household cannot put a video on this household's entry", async () => refused(() => add(ben, E("a1"), B, `${B}/videos/x.mp4`, `${B}/videos/x.jpg`)));
  await check("Nor by claiming this household's id", async () => refused(() => add(ben, E("a1"), A, `${A}/videos/x.mp4`, `${A}/videos/x.jpg`)));
  await check("A video cannot point at another household's files", async () => refused(() => add(ann, E("a1"), A, `${B}/videos/x.mp4`, AP)));
  await check("Nor at someone else's own folder", async () => refused(() => add(kid, E("a1"), A, "person/00000000-0000-0000-0000-0000000000b1/videos/x.mp4", AP)));

  await check("Another household cannot delete the video", async () => {
    await as(dan, "delete from journal_entry_videos where entry_id = $1", [E("a1")]);
    return sees(ann, E("a1"));
  });
  await check("Another household cannot delete its files", async () => {
    await as(dan, "delete from storage.objects where name = $1", [AV]);
    return reads(ann, AV);
  });
  await check("The household can take the video off", async () => {
    await as(kid, "delete from journal_entry_videos where entry_id = $1", [E("a1")]);
    return !(await sees(ann, E("a1")));
  });
}
