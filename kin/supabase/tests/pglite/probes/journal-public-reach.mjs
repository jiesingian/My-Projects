// Journal "Public" entries reach the writer's grown-up accepted connections
// and the grown-ups linked on the writer's tree, nobody else; never a child
// with a login (20261021140000_journal_public_tree_linked.sql,
// 20261022010000_journal_public_grownups_only.sql).
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const F = (s) => `${s}0000000-0000-0000-0000-000000000000`;
const ENTRY = "e0000000-0000-0000-0000-0000000000b2";
const HOME = "e0000000-0000-0000-0000-0000000000b5";
export default async function ({ db, as, check }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2"), bob = U("b3"), bea = U("b4"), eve = U("e1"), abe = U("a7");
  // House B: Ben writes; Bob, a grown-up (connected to Ben on joining, #824);
  // Bea, a child placed on B's tree. Eve: a household of her own, nobody's.
  await db.exec(`
    insert into families (id, name) values ('${F("e")}', 'House E');
    insert into people (id, auth_user_id) values ('${P("b3")}','${bob}'), ('${P("b4")}','${bea}'), ('${P("e1")}','${eve}'), ('${P("a7")}','${abe}');
    insert into members (id, family_id, person_id, auth_user_id, full_name, role) values
      ('${P("b3")}','${F("b")}','${P("b3")}','${bob}','Bob B','adult'),
      ('${P("b4")}','${F("b")}','${P("b4")}','${bea}','Bea B','child_self'),
      ('${P("e1")}','${F("e")}','${P("e1")}','${eve}','Eve E','adult'),
      ('${P("a7")}','${F("a")}','${P("a7")}','${abe}','Abe A','adult');
    select public.connect_household_grownups('${F("b")}');
    insert into journal_entries (id, family_id, visibility, owner_person_id, public_at) values ('${ENTRY}','${F("b")}','personal','${P("b1")}', now()),
      ('${HOME}','${F("b")}','household','${P("b1")}', now());
    insert into connections (requester_person_id, addressee_person_id, status) values
      ('${P("a1")}','${P("b1")}','accepted'),
      ('${P("c1")}','${P("a1")}','accepted'),
      ('${P("d1")}','${P("b1")}','pending'),
      ('${P("b1")}','${P("d2")}','removed'),
      ('${P("e1")}','${P("b1")}','declined'),
      ('${P("a2")}','${P("b1")}','accepted');
    insert into family_tree_people (id, family_id, member_id, full_name) values
      ('f0000000-0000-0000-0000-0000000000b4','${F("b")}','${P("b4")}','Bea B'),
      ('f0000000-0000-0000-0000-0000000000b9','${F("b")}',null,'Kid, as B knows her'),
      ('f0000000-0000-0000-0000-0000000000a2','${F("a")}','${P("a2")}','Kid A'),
      ('f0000000-0000-0000-0000-0000000000b8','${F("b")}',null,'Abe, as B knows him'),
      ('f0000000-0000-0000-0000-0000000000a7','${F("a")}','${P("a7")}','Abe A');
    insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id, to_person_id, status) values
      ('${F("b")}','f0000000-0000-0000-0000-0000000000b9','${F("a")}','f0000000-0000-0000-0000-0000000000a2','accepted'),
      ('${F("b")}','f0000000-0000-0000-0000-0000000000b8','${F("a")}','f0000000-0000-0000-0000-0000000000a7','accepted');
  `);
  const sees = async (who) => (await as(who, "select 1 from journal_entries where id = $1", [ENTRY])).length === 1;
  const fn = async (who) => (await as(who, "select entry_public_to_me($1) v", [ENTRY]))[0].v === true;

  await check("The writer sees it", async () => await sees(ben));
  await check("An accepted connection sees it", async () => (await sees(ann)) && (await fn(ann)));
  await check("The household's other grown-up (connected from the start) sees it", async () => await sees(bob));
  await check("A grown-up matched onto the writer's tree, households linked, sees it", async () => (await sees(abe)) && (await fn(abe)));
  await check("A child (with a login) on the writer's tree does not", async () => !(await sees(bea)) && !(await fn(bea)));
  await check("A child matched onto the writer's tree, and an accepted connection, does not", async () => !(await sees(kid)) && !(await fn(kid)));
  await check("The child still reads a Public entry also shared with her household", async () => (await as(bea, "select 1 from journal_entries where id = $1", [HOME])).length === 1);
  await check("A connection's connection does not", async () => !(await sees(cat)) && !(await fn(cat)));
  await check("A pending request (one way, not accepted) does not", async () => !(await sees(dan)) && !(await fn(dan)));
  await check("A removed connection does not", async () => !(await sees(dee)));
  await check("A declined one does not", async () => !(await sees(eve)));
  await check("on_family_tree_as_me answers only for the caller", async () => (await as(cat, "select on_family_tree_as_me($1) v", [F("b")]))[0].v === false);

  await db.exec(`update family_links set status = 'removed' where requester_family_id = '${F("a")}' and addressee_family_id = '${F("b")}'`);
  await check("Households unlinked: the matched grown-up no longer sees it", async () => !(await sees(abe)));
  await db.exec(`update connections set status = 'removed' where requester_person_id = '${P("a1")}' and addressee_person_id = '${P("b1")}'`);
  await check("Connection removed: no longer sees it", async () => !(await sees(ann)));
  await db.exec(`update journal_entries set public_at = null where id = '${ENTRY}'`);
  await check("No longer Public: the connected grown-up sees nothing", async () => !(await sees(bob)));
}
