// No file is left behind in a member's own folder when its row goes
// (20261022120000). Deleting a journal_media or journal_entry_videos row
// that names a person/ file -- a household deleted, an account deleted, one
// row removed -- notes the path in storage_sweep through queue_person_files;
// the daily job lists what no row still names with due_storage_sweep,
// removes it, and calls forget_storage_sweep. Nobody signed in or signed out
// can read, write or call any of it.
const F = "f1000000-0000-0000-0000-000000000000";
const FAY = "10000000-0000-0000-0000-0000000000f1";
const P = (x) => `00000000-0000-0000-0000-0000000000${x}`;
const E = "e2000000-0000-0000-0000-000000000001";

export default async function householdPersonFiles({ db, as, check, refused }) {
  const svc = async (sql, params = []) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    await db.exec("set role service_role");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const anon = async (sql) => {
    await db.exec("reset role");
    await db.exec("set role anon");
    try {
      return (await db.query(sql)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const due = async () => (await svc("select bucket, path from due_storage_sweep() order by path")).map((r) => `${r.bucket}:${r.path}`);

  // A household of its own, cascading as on dev, with journal rows that name
  // files in the household's folder and in two people's own folders.
  await db.exec(`
    -- As on Supabase, the service role is not held back by row-level security.
    alter role service_role bypassrls;
    alter table members drop constraint if exists members_family_id_fkey;
    alter table members add constraint members_family_id_fkey foreign key (family_id) references families(id) on delete cascade;
    alter table journal_entries drop constraint if exists journal_entries_family_id_fkey;
    alter table journal_entries add constraint journal_entries_family_id_fkey foreign key (family_id) references families(id) on delete cascade;
    insert into families (id, name) values ('${F}', 'House F');
    insert into people (id, auth_user_id) values ('${P("f1")}', '${FAY}'), ('${P("f2")}', null);
    insert into members (id, family_id, person_id, auth_user_id, full_name, role) values
      ('${P("f1")}', '${F}', '${P("f1")}', '${FAY}', 'Fay F', 'parent'),
      ('${P("f2")}', '${F}', '${P("f2")}', null, 'Gus F', 'adult');
    insert into journal_entries (id, family_id, visibility, owner_person_id) values ('${E}', '${F}', 'personal', '${P("f2")}');
    insert into journal_media (family_id, owner_person_id, visibility, storage_path) values
      ('${F}', '${P("f2")}', 'personal', 'person/${P("f2")}/private.jpg'),
      ('${F}', '${P("f1")}', 'household', 'person/${P("f1")}/shared-from-just-me.jpg'),
      ('${F}', '${P("f1")}', 'household', '${F}/household.jpg');
    insert into journal_entry_videos (entry_id, family_id, storage_path, poster_path, mime_type, width, height, duration_seconds) values
      ('${E}', '${F}', 'person/${P("f2")}/videos/v.mp4', 'person/${P("f2")}/videos/v.jpg', 'video/mp4', 640, 480, 5);
    -- The same file named by a row in another household: it stays.
    insert into journal_media (family_id, owner_person_id, visibility, storage_path) values
      ('a0000000-0000-0000-0000-000000000000', '${P("f1")}', 'household', 'person/${P("f1")}/shared-from-just-me.jpg');
  `);

  await check("Signed in, nobody can read, add to, change or clear storage_sweep", async () => {
    await db.exec("insert into storage_sweep (bucket, path) values ('journal', 'person/x/seed.jpg')");
    const results = {
      read: await refused(() => as(FAY, "select * from storage_sweep")),
      insert: await refused(() => as(FAY, "insert into storage_sweep (bucket, path) values ('journal', 'person/x/y.jpg')")),
      update: await refused(() => as(FAY, "update storage_sweep set path = 'person/other/z.jpg'")),
      remove: await refused(() => as(FAY, "delete from storage_sweep")),
    };
    const left = (await db.query("select count(*)::int n from storage_sweep where path = 'person/x/seed.jpg'")).rows[0].n;
    await db.exec("delete from storage_sweep");
    return (Object.values(results).every((r) => r === true) && left === 1) || { results, left };
  });
  await check("Signed out, nobody can read storage_sweep", () => refused(() => anon("select * from storage_sweep")));
  await check("Nobody signed in can list, forget or queue through the functions", async () => {
    const results = {
      due: await refused(() => as(FAY, "select * from due_storage_sweep()")),
      forget: await refused(() => as(FAY, "select forget_storage_sweep('journal', array['person/x/y.jpg'])")),
      queue: await refused(() => as(FAY, "select queue_person_files()")),
      anonDue: await refused(() => anon("select * from due_storage_sweep()")),
    };
    return Object.values(results).every((r) => r === true) || results;
  });

  await check("The household is deleted: every person/ file its rows named is queued, nothing in its own folder", async () => {
    await db.exec(`delete from families where id = '${F}'`);
    const queued = (await db.query("select bucket || ':' || path p from storage_sweep order by path")).rows.map((r) => r.p);
    const want = [
      `journal:person/${P("f1")}/shared-from-just-me.jpg`,
      `journal:person/${P("f2")}/private.jpg`,
      `journal:person/${P("f2")}/videos/v.jpg`,
      `journal:person/${P("f2")}/videos/v.mp4`,
    ];
    return JSON.stringify(queued) === JSON.stringify(want) || queued;
  });
  await check("The daily job is not given a file another row still names", async () => {
    const list = await due();
    const ok = list.length === 3 && !list.some((p) => p.includes("shared-from-just-me"));
    return ok || list;
  });
  await check("One photo row deleted on its own is queued too", async () => {
    await db.exec(`
      insert into journal_media (family_id, owner_person_id, visibility, storage_path) values ('a0000000-0000-0000-0000-000000000000', '${P("a1")}', 'personal', 'person/${P("a1")}/one.jpg');
      delete from journal_media where storage_path = 'person/${P("a1")}/one.jpg';
    `);
    return (await due()).includes(`journal:person/${P("a1")}/one.jpg`);
  });
  await check("The daily job forgets what it removed, and only that", async () => {
    const n = (await svc(`select forget_storage_sweep('journal', $1) n`, [[`person/${P("f2")}/private.jpg`, `person/${P("a1")}/one.jpg`]]))[0].n;
    const list = await due();
    return (n === 2 && list.length === 2 && list.every((p) => p.includes("/videos/"))) || { n, list };
  });
}
