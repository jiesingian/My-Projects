// Whose recipe it is (20261019150000): a recipe names somebody on its own
// household's tree, never another's, and keeps itself when they are taken
// off it.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const LOLA = "f2000000-0000-0000-0000-0000000000a1";
const BENS = "f2000000-0000-0000-0000-0000000000b1";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), ben = U("b1");
  await db.exec(`insert into family_tree_people (id, family_id, full_name) values ('${LOLA}', '${A}', 'Lola Remedios'), ('${BENS}', '${B}', 'Lola ni Ben')`);
  let adobo;
  await check("A recipe can be Lola's", async () => {
    adobo = (await as(ann, "insert into family_recipes (family_id, name, tree_person_id) values ($1, 'Adobo', $2) returning id", [A, LOLA]))[0]?.id;
    return !!adobo;
  });
  await check("Or nobody's", async () => (await as(ann, "insert into family_recipes (family_id, name) values ($1, 'Sinigang') returning id", [A])).length === 1);
  await check("Not somebody on another household's tree", async () =>
    refused(() => as(ann, "insert into family_recipes (family_id, name, tree_person_id) values ($1, 'Kare-kare', $2)", [A, BENS]), "not on your family tree"));
  await check("Nor moved onto them later", async () => refused(() => as(ann, "update family_recipes set tree_person_id = $2 where id = $1", [adobo, BENS])));
  await check("Another household cannot hang its recipe on this household's Lola", async () =>
    refused(() => as(ben, "insert into family_recipes (family_id, name, tree_person_id) values ($1, 'Pancit', $2)", [B, LOLA])));
  await check("Another household cannot see whose recipe it is", async () => (await as(ben, "select 1 from family_recipes where id = $1", [adobo])).length === 0);
  await check("Changing the steps leaves the name alone", async () =>
    (await as(ann, "update family_recipes set steps = '{Brown the pork}' where id = $1 returning tree_person_id", [adobo]))[0]?.tree_person_id === LOLA);
  await check("Taking Lola off the tree keeps the recipe, without her name", async () => {
    await as(ann, "delete from family_tree_people where id = $1", [LOLA]);
    const r = (await db.query("select tree_person_id from family_recipes where id = $1", [adobo])).rows[0];
    return r && r.tree_person_id === null;
  });
  await check("Signed-in browsers cannot run the check by hand", async () =>
    (await db.query(`select has_function_privilege('authenticated', 'public.family_recipes_person_fits()', 'execute') as ok`)).rows[0].ok === false);
}
