// Delete a vault folder only when it is empty (20261027160000): empty for
// everyone, so a "Just me" entry the deleter cannot see still keeps it; a
// child or another household deletes nothing.
const A = "a0000000-0000-0000-0000-000000000000";
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;

export default async function ({ db, as, check }) {
  await db.exec("reset role");
  const folder = async (name) => (await db.query("insert into doc_folders (family_id, name) values ($1, $2) returning id", [A, name])).rows[0].id;
  const empty = await folder("Old"), full = await folder("Passports"), hidden = await folder("Mine");
  await db.query("insert into doc_entries (family_id, folder_id, title) values ($1, $2, 'Passport')", [A, full]);
  await db.query("insert into doc_entries (family_id, folder_id, title, visibility) values ($1, $2, 'Private', 'private')", [A, hidden]);
  const del = async (who, id) => (await as(who, "select public.delete_empty_doc_folder($1) as r", [id]))[0].r;
  const left = async (id) => { await db.exec("reset role"); return (await db.query("select 1 from doc_folders where id = $1", [id])).rows.length; };

  await check("A child cannot delete a folder", async () => (await del(U("a2"), empty)) === "not_found" && (await left(empty)) === 1);
  await check("Another household cannot delete it", async () => (await del(U("d1"), empty)) === "not_found" && (await left(empty)) === 1);
  await check("A folder with entries stays", async () => (await del(U("a1"), full)) === "not_empty" && (await left(full)) === 1);
  await check("An entry the deleter cannot see still keeps the folder", async () => {
    const seen = (await as(U("a1"), "select 1 from doc_entries where folder_id = $1", [hidden])).length;
    return seen === 0 && (await del(U("a1"), hidden)) === "not_empty" && (await left(hidden)) === 1;
  });
  await check("A grown-up deletes an empty folder", async () => (await del(U("a1"), empty)) === "deleted" && (await left(empty)) === 0);
}
