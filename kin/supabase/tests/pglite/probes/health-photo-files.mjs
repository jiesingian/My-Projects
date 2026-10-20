// The files behind health photos (20261020090100): a prescription photo's
// file in the journal bucket is read or removed only by whoever can see its
// row -- so a parents-only or private medicine's slip is hidden from a child
// in the same household, as the row already was -- while a file no row names
// (just uploaded, or its row just deleted) stays the household's, so the app
// can still record it and clean it up. And when the organizer deletes the
// household (20261020180000), every health photo row goes with it, so the
// files a private row hid from them can be removed too.
const A = "a0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const ABE = "10000000-0000-0000-0000-0000000000a4"; // adult in A, not the organizer
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const VISIT = "e3100000-0000-0000-0000-0000000000a1";
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
    -- The organizer flag (pre-pipeline), which delete_household and now
    -- forget_household_health_photos() turn on.
    alter table members add column if not exists is_organiser boolean not null default false;
    update members set is_organiser = true where id = '${ANN_M}';
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

  // -- Deleting the household (20261020180000) ----------------------------------
  const privFile = `${A}/health/${PAR}/private-slip.jpg`;
  const visitFile = `${A}/health/${VISIT}/visit.jpg`;
  await db.query("insert into storage.objects (bucket_id, name) values ('journal', $1), ('journal', $2)", [privFile, visitFile]);
  await db.query("insert into health_medicine_photos (family_id, medicine_id, storage_path, created_by) values ($1, $2, $3, $4)", [A, PAR, privFile, ANN_M]);
  await db.query("insert into health_visit_photos (family_id, appointment_id, storage_path, created_by) values ($1, $2, $3, $4)", [A, VISIT, visitFile, ANN_M]);
  await db.query("update health_medicines set visibility = 'private', created_by = null where id = $1", [PAR]);
  const D = "d0000000-0000-0000-0000-000000000000";
  const DMED = "e3100000-0000-0000-0000-0000000000d1";
  await db.query("insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility) values ($1, $2, $3, 'Dan med', '{08:00}', current_date, 'family')", [DMED, D, "00000000-0000-0000-0000-0000000000d1"]);
  await db.query("insert into health_medicine_photos (family_id, medicine_id, storage_path) values ($1, $2, $3)", [D, DMED, `${D}/health/${DMED}/slip.jpg`]);
  const forget = (who) => as(who, "select forget_household_health_photos() as p");
  await check("The organizer cannot see a private medicine's slip, nor remove its file, while its row stands", async () =>
    !(await files(ANN)).includes(privFile) &&
    (await as(ANN, "delete from storage.objects where name = $1 returning name", [privFile])).length === 0);
  await check("A child, an adult who is not the organizer, and a stranger cannot forget the household's photos", async () => {
    const kid = (await forget(KID).catch((e) => e.message)) ;
    const abe = (await forget(ABE).catch((e) => e.message));
    const dan = (await forget(DAN).catch((e) => e.message));
    const rows = (await db.query("select count(*)::int as n from health_medicine_photos where family_id = $1", [A])).rows[0].n;
    return ([kid, abe, dan].every((r) => typeof r === "string" && /organizer/.test(r)) && rows === 2) || { kid, abe, dan, rows };
  });
  await check("The organizer gets every health photo's path, the private slip and the visit photo included, and the rows are gone", async () => {
    const paths = (await forget(ANN)).map((r) => r.p).sort();
    const left = (await db.query("select count(*)::int as n from health_medicine_photos where family_id = $1", [A])).rows[0].n
      + (await db.query("select count(*)::int as n from health_visit_photos where family_id = $1", [A])).rows[0].n;
    return (paths.join() === [famFile, privFile, visitFile].sort().join() && left === 0) || { paths, left };
  });
  await check("With no row naming them, the organizer removes those files", async () => {
    await as(ANN, "delete from storage.objects where name = any($1)", [[famFile, privFile, visitFile]]);
    return (await db.query("select count(*)::int as n from storage.objects where name = any($1)", [[famFile, privFile, visitFile]])).rows[0].n === 0;
  });
  await check("Another household's photo rows are untouched", async () =>
    (await db.query("select count(*)::int as n from health_medicine_photos where family_id = $1", [D])).rows[0].n === 1);
  await check("Signed out, nothing is forgotten", async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
    await db.exec("set role anon");
    try {
      await db.query("select forget_household_health_photos()");
      return false;
    } catch {
      return true;
    } finally {
      await db.exec("reset role");
    }
  });
}
