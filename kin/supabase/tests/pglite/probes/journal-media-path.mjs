// A journal photo's file is in its own household's folder or its uploader's
// own (20261030120000_review_fixes.sql, 1): a member cannot file a row naming
// someone else's person/ path -- the row a storage delete policy and the
// account-deletion job would then act on -- nor another household's folder.
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const ANN = "10000000-0000-0000-0000-0000000000a1";
const ANN_P = "00000000-0000-0000-0000-0000000000a1";
const BEN_P = "00000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const add = (who, family, path, visibility = "household", owner = null) =>
    as(who, "insert into journal_media (family_id, visibility, owner_person_id, storage_path) values ($1, $2, $3, $4) returning id", [family, visibility, owner, path]);

  await check("Ann files a photo under her household's folder", async () => (await add(ANN, A, `${A}/2026/one.jpg`)).length === 1);
  await check("Ann files a photo under her own person folder", async () => (await add(ANN, A, `person/${ANN_P}/two.jpg`, "personal", ANN_P)).length === 1);
  await check("A Drive photo has no Kin path and is let through", async () => (await add(ANN, A, null)).length === 1);

  await check("Ann cannot name Ben's person folder, as a household row or her own", async () => {
    const household = await refused(() => add(ANN, A, `person/${BEN_P}/private.jpg`));
    const personal = await refused(() => add(ANN, A, `person/${BEN_P}/private.jpg`, "personal", BEN_P));
    return (household === true && personal === true) || { household, personal };
  });
  await check("Ann cannot name another household's folder", async () => (await refused(() => add(ANN, A, `${B}/2026/theirs.jpg`))) === true);
  await check("Nor climb out of her own with ..", async () => (await refused(() => add(ANN, A, `${A}/../person/${BEN_P}/x.jpg`))) === true);

  const [{ id }] = await add(ANN, A, `${A}/2026/three.jpg`);
  await check("Nor point an existing row at Ben's file", async () =>
    (await refused(() => as(ANN, "update journal_media set storage_path = $1 where id = $2", [`person/${BEN_P}/private.jpg`, id]))) === true);
  await check("Other changes to a row whose path stays are untouched", async () => {
    await db.exec("reset role");
    // A photo Ben gave the household keeps its person/ path (moved from personal).
    const [{ id: given }] = (await db.query("insert into journal_media (family_id, visibility, owner_person_id, storage_path) values ($1, 'household', $2, $3) returning id", [A, BEN_P, `person/${BEN_P}/given.jpg`])).rows;
    const r = await as(ANN, "update journal_media set visibility = 'household' where id = $1 returning id", [given]);
    return r.length === 1 || { r };
  });
  await check("The service role's own writes are let through", async () => {
    await db.exec("reset role");
    const r = await db.query("insert into journal_media (family_id, visibility, storage_path) values ($1, 'household', $2) returning id", [A, `person/${BEN_P}/moved.jpg`]);
    return r.rows.length === 1;
  });
}
