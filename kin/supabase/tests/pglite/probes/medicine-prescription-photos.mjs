// Prescription photos on a medicine (20261015130000): seen, added and removed
// by exactly whoever can see the medicine, in its own household only, with
// the file in that medicine's own folder; new ones are Kin Plus.
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1"; // parent in A
const KID = "10000000-0000-0000-0000-0000000000a2"; // child in A, own login
const ABE = "10000000-0000-0000-0000-0000000000a4"; // adult in A, not a parent
const BEN = "10000000-0000-0000-0000-0000000000b1"; // parent in B, linked with A
const CAT = "10000000-0000-0000-0000-0000000000c1"; // parent in C, linked with A
const DAN = "10000000-0000-0000-0000-0000000000d1"; // a stranger to A
const ANN_M = "00000000-0000-0000-0000-0000000000a1";
const KID_M = "00000000-0000-0000-0000-0000000000a2";
const ABE_M = "00000000-0000-0000-0000-0000000000a4";
const BEN_M = "00000000-0000-0000-0000-0000000000b1";
const LOLA_M = "00000000-0000-0000-0000-0000000000f5";
const MED = "e3000000-0000-0000-0000-000000000001"; // Lola's, whole family
const PAR = "e3000000-0000-0000-0000-000000000002"; // Lola's, parents only
const PRIV = "e3000000-0000-0000-0000-000000000003"; // Ann's private note of Lola's medicine
const KIDMED = "e3000000-0000-0000-0000-000000000004"; // the child's own, parents only

const path = (med, family = A) => `${family}/health/${med}/${crypto.randomUUID()}.jpg`;

export default async function ({ db, as, check, refused }) {
  // The medicines' own visibility (20260926110000), in place of base.sql's
  // household-wide stand-in, so a parents-only or private medicine is really hidden.
  await db.exec(`
    drop policy if exists hm_all on health_medicines;
    create policy hm_select on health_medicines for select using (
      family_id = current_family_id()
      and (visibility = 'family' or member_id = current_member_id() or created_by = current_member_id()
           or (visibility = 'parents' and current_member_role() = 'parent')));
    insert into members (id, family_id, auth_user_id, full_name, role) values ('${LOLA_M}', '${A}', null, 'Lola Reyes', 'adult');
    insert into health_medicines (id, family_id, member_id, name, times, start_date, visibility, created_by) values
      ('${MED}', '${A}', '${LOLA_M}', 'Losartan', '{08:00}', current_date - 3, 'family', '${ANN_M}'),
      ('${PAR}', '${A}', '${LOLA_M}', 'Metformin', '{08:00}', current_date - 3, 'parents', '${ANN_M}'),
      ('${PRIV}', '${A}', '${LOLA_M}', 'Sertraline', '{08:00}', current_date - 3, 'private', '${ANN_M}'),
      ('${KIDMED}', '${A}', '${KID_M}', 'Cetirizine', '{20:00}', current_date - 3, 'parents', '${ANN_M}');
  `);
  const add = (who, med, by, p = path(med), family = A) =>
    as(who, "insert into health_medicine_photos (family_id, medicine_id, storage_path, created_by) values ($1, $2, $3, $4) returning id", [family, med, p, by]);
  const seen = async (who) => (await as(who, "select medicine_id from health_medicine_photos")).map((r) => r.medicine_id).sort();

  await check("A grown-up adds a prescription photo to a medicine the family sees", async () => (await add(ANN, MED, ANN_M)).length === 1);
  await check("A parent adds one to a parents-only and to their own private medicine", async () => (await add(ANN, PAR, ANN_M)).length === 1 && (await add(ANN, PRIV, ANN_M)).length === 1);
  await check("A child adds one to their own medicine, even a parents-only one", async () => (await add(KID, KIDMED, KID_M)).length === 1);

  await check("Another household sees none", async () => (await seen(DAN)).length === 0);
  await check("A linked household sees none, sharing or not", async () => (await seen(BEN)).length === 0 && (await seen(CAT)).length === 0);
  await check("The parent sees all four", async () => (await seen(ANN)).length === 4 || seen(ANN));
  await check("A grown-up who is not a parent sees the family's medicine only", async () => {
    const s = await seen(ABE);
    return (s.length === 1 && s[0] === MED) || s;
  });
  await check("A child sees the family's and their own, not a parents-only or private one of someone else", async () => {
    const s = await seen(KID);
    return JSON.stringify(s) === JSON.stringify([MED, KIDMED].sort()) || s;
  });

  await check("Another household cannot add to this household's medicine", async () => refused(() => add(DAN, MED, "00000000-0000-0000-0000-0000000000d1")));
  await check("A linked household cannot add to it, even naming A as the household", async () =>
    refused(() => add(BEN, MED, BEN_M)));
  await check("A forged household is refused", async () => refused(() => add(ANN, MED, ANN_M, path(MED, B), B)));
  await check("A forged author is refused", async () => refused(() => add(ANN, MED, KID_M)));
  await check("Someone who cannot see the medicine cannot add to it", async () =>
    (await refused(() => add(ABE, PAR, ABE_M))) && (await refused(() => add(ABE, PRIV, ABE_M))) && (await refused(() => add(KID, PAR, KID_M))));
  await check("A path in another household's folder is refused", async () => refused(() => add(ANN, MED, ANN_M, `${B}/health/${MED}/x.jpg`)));
  await check("A path in another medicine's folder is refused", async () => refused(() => add(ANN, MED, ANN_M, path(PAR))));
  await check("A path that climbs out of the folder is refused", async () => refused(() => add(ANN, MED, ANN_M, `${A}/health/${MED}/../../x.jpg`)));

  await check("Someone who cannot see the medicine cannot remove its photo", async () => {
    await as(ABE, "delete from health_medicine_photos where medicine_id = $1", [PAR]);
    await as(KID, "delete from health_medicine_photos where medicine_id = $1", [PAR]);
    await as(DAN, "delete from health_medicine_photos");
    await as(BEN, "delete from health_medicine_photos");
    return (await seen(ANN)).length === 4;
  });
  await check("Whoever can see it can remove it", async () => {
    await as(ABE, "delete from health_medicine_photos where medicine_id = $1", [MED]);
    return !(await seen(ANN)).includes(MED);
  });
  await check("Deleting the medicine takes its photo rows with it", async () => {
    await db.query("delete from health_medicines where id = $1", [PRIV]);
    return !(await seen(ANN)).includes(PRIV);
  });
  await check("Nothing is open to someone signed out", async () =>
    refused(async () => {
      await db.exec("set role anon");
      try {
        await db.query("insert into health_medicine_photos (family_id, medicine_id, storage_path) values ($1, $2, $3)", [A, MED, path(MED)]);
      } finally {
        await db.exec("reset role");
      }
    }));

  await check("On Kin Free a new prescription photo is refused", async () => {
    await db.exec(`
      create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select false $$;
      create or replace function public.require_kin_plus() returns trigger language plpgsql security definer set search_path = public as $$
      begin
        if auth.uid() is not null and not public.family_has_plus(new.family_id) then
          raise exception 'kin_plus_required: % is part of Kin Plus', tg_argv[0];
        end if;
        return new;
      end $$;
    `);
    return await refused(() => add(ANN, MED, ANN_M), "kin_plus_required");
  });
}
