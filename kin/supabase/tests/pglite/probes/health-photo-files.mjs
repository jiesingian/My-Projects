// The files behind health photos (20261020090100): a prescription photo's
// file in the journal bucket is read or removed only by whoever can see its
// row -- so a parents-only or private medicine's slip is hidden from a child
// in the same household, as the row already was -- while a file no row names
// (just uploaded, or its row just deleted) stays the household's, so the app
// can still record it and clean it up.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const LOLA_M = "00000000-0000-0000-0000-0000000000f6";
const MED = "e3100000-0000-0000-0000-000000000001"; // Lola's, whole family
const PAR = "e3100000-0000-0000-0000-000000000002"; // Lola's, parents only

export default async function ({ db, as, check }) {
  // The medicines' own visibility (20260926110000), and production's
  // household-wide journal delete (journal_family_delete), in place of
  // base.sql's stand-ins.
  await db.exec(`
    drop policy if exists hm_all on health_medicines;
    drop policy if exists hm_select on health_medicines;
    create policy hm_select on health_medicines for select using (
      family_id = current_family_id()
      and (visibility = 'family' or member_id = current_member_id() or created_by = current_member_id()
           or (visibility = 'parents' and current_member_role() = 'parent')));
    drop policy if exists journal_own_family_delete on storage.objects;
    create policy journal_own_family_delete on storage.objects for delete to authenticated
      using (bucket_id = 'journal' and split_part(name, '/', 1) = public.current_family_id()::text);
    insert into members (id, family_id, auth_user_id, full_name, role) values ('${LOLA_M}', '${A}', null, 'Lola Cruz', 'adult');
    insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility, created_by) values
      ('${MED}', '${A}', '${LOLA_M}', 'Amlodipine', '{08:00}', current_date - 3, 'family', '${ANN_M}'),
      ('${PAR}', '${A}', '${LOLA_M}', 'Insulin', '{08:00}', current_date - 3, 'parents', '${ANN_M}');
  `);
  const famFile = `${A}/health/${MED}/slip.jpg`;
  const parFile = `${A}/health/${PAR}/slip.jpg`;
  const loose = `${A}/health/${PAR}/just-uploaded.jpg`;
  const other = `${A}/events/e/photo.jpg`;
  await db.query("insert into storage.objects (bucket_id, name) values ('journal', $1), ('journal', $2), ('journal', $3), ('journal', $4)", [famFile, parFile, loose, other]);
  await db.query("insert into health_medicine_photos (family_id, medicine_id, storage_path, created_by) values ($1, $2, $3, $4), ($1, $5, $6, $4)", [A, MED, famFile, ANN_M, PAR, parFile]);

  const files = async (who) => (await as(who, "select name from storage.objects where bucket_id = 'journal' and name like $1 order by name", [`${A}/%`])).map((r) => r.name);

  await check("A parent reads the parents-only medicine's prescription file", async () => (await files(ANN)).includes(parFile) || files(ANN));
  await check("A child in the household cannot list or read it", async () => {
    const s = await files(KID);
    return (!s.includes(parFile) && s.includes(famFile)) || s;
  });
  await check("A child cannot remove it either", async () => {
    await as(KID, "delete from storage.objects where name = $1", [parFile]);
    return (await db.query("select 1 from storage.objects where name = $1", [parFile])).rows.length === 1;
  });
  await check("The child still reads and removes files outside health/", async () => (await files(KID)).includes(other));
  await check("A file no row names yet is the household's, as before", async () => (await files(KID)).includes(loose));
  await check("Another household reads none of it", async () => (await files(DAN)).length === 0);
  await check("Once its row is deleted, the file can be cleaned up by whoever deleted it", async () => {
    await as(ANN, "delete from health_medicine_photos where storage_path = $1", [parFile]);
    await as(ANN, "delete from storage.objects where name = $1", [parFile]);
    return (await db.query("select 1 from storage.objects where name = $1", [parFile])).rows.length === 0;
  });
}
