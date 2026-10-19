import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;

// Private notes (20260928185000, section 9; the screen 19 October): only the
// author ever sees, changes or deletes them -- not a parent, not anyone in the
// household, not a linked household. The rest of that migration leans on
// tables this stand-in schema doesn't have, so the probe runs the real
// table-and-policy section of the file, as written, rather than a copy.
const here = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(here, "..", "..", "..", "migrations", "20260928185000_people_and_personal_space.sql"), "utf8");
const section = migration.slice(migration.indexOf("-- 9. Private notes"), migration.indexOf("-- 10. When the account is deleted"));

export default async function ({ db, as, check, refused }) {
  await db.exec(section);
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1");
  const note = (await as(ann, "insert into personal_notes (body) values ('gift idea for Kid') returning id, owner_person_id"))[0];
  await check("Ann's note is hers (owner from the caller)", async () => note.owner_person_id === P("a1") || note);
  await check("Ann reads it back", async () => (await as(ann, "select body from personal_notes"))[0]?.body === "gift idea for Kid");
  await check("Kid (same household), Ben (linked) and Dan (stranger) see none of it", async () =>
    (await as(kid, "select 1 from personal_notes")).length === 0 &&
    (await as(ben, "select 1 from personal_notes")).length === 0 &&
    (await as(dan, "select 1 from personal_notes")).length === 0);
  await check("Nobody can write a note as Ann", async () =>
    refused(() => as(kid, "insert into personal_notes (owner_person_id, body) values ($1, 'x')", [P("a1")])));
  await check("Kid's update and delete of Ann's note touch nothing", async () => {
    const upd = await as(kid, "update personal_notes set body = 'hacked' where id = $1 returning id", [note.id]);
    const del = await as(kid, "delete from personal_notes where id = $1 returning id", [note.id]);
    const still = (await as(ann, "select body from personal_notes where id = $1", [note.id]))[0]?.body;
    return (upd.length === 0 && del.length === 0 && still === "gift idea for Kid") || { upd, del, still };
  });
  await check("Ann cannot hand her note to someone else", async () =>
    refused(() => as(ann, "update personal_notes set owner_person_id = $1 where id = $2", [P("a2"), note.id])));
  await check("A child with a login keeps notes of their own, unseen by the parent", async () => {
    await as(kid, "insert into personal_notes (body) values ('my secret')");
    return (await as(ann, "select 1 from personal_notes where body = 'my secret'")).length === 0 &&
      (await as(kid, "select body from personal_notes")).map((r) => r.body).join() === "my secret";
  });
  await check("An empty note is refused", async () => refused(() => as(ann, "insert into personal_notes (body) values ('   ')")));
  await check("Ann edits and deletes her own", async () => {
    await as(ann, "update personal_notes set body = 'changed' where id = $1", [note.id]);
    const changed = (await as(ann, "select body from personal_notes where id = $1", [note.id]))[0]?.body === "changed";
    await as(ann, "delete from personal_notes where id = $1", [note.id]);
    return changed && (await as(ann, "select 1 from personal_notes where id = $1", [note.id])).length === 0;
  });
}
