const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
/** 20261021040000: the grown-ups of one household are connected from the
 * start (connect_household_grownups, trigger members_connect_grownups).
 * Base has Ann (parent) and Abe (adult, no person row yet) in House A, so
 * the backfill at migration time connects nobody there; giving Abe a person
 * and a login is what a join does, and the trigger fires on it. */
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), dan = U("d1"), abe = U("a4");
  await check("Before Abe has a login, Ann is connected with nobody (the backfill made no pair)", async () => (await as(ann, "select * from my_connected_person_ids()")).length === 0);
  await check("Children are not connected by it: Ann-Kid false", async () => (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a2")]))[0].v === false);

  // Abe gets a person row and his login is attached: what approving a join does.
  await db.exec(`insert into people (id, auth_user_id) values ('${P("a4")}', '${U("a4")}')`);
  await db.exec(`update members set person_id = '${P("a4")}' where id = '${P("a4")}'`);

  await check("Ann and Abe (two grown-ups of House A) are connected at once", async () => (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a4")]))[0].v === true);
  await check("Abe sees Ann as an accepted connection with her name and household", async () => {
    const r = await as(abe, "select full_name, status, household_name, via from my_connections()");
    return (r.length === 1 && r[0].full_name === "Ann A" && r[0].status === "accepted" && r[0].household_name === "House A" && r[0].via === "tree") || r;
  });
  await check("Ann is no longer offered Abe as a candidate", async () => !(await as(ann, "select full_name from connection_candidates()")).some((r) => r.full_name === "Abe A"));
  const [lo, hi] = [P("a1"), P("a4")].sort();
  await check("Abe can message Ann with no request", async () => {
    const r = await as(abe, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'kain na') returning sender_person_id", [lo, hi]);
    return r[0].sender_person_id === P("a4") || r;
  });
  await check("Kid (child of the same house) is still not connected with Abe, and cannot DM him", async () => {
    const [l, h] = [P("a2"), P("a4")].sort();
    return (await as(kid, "select are_connected($1,$2) v", [P("a2"), P("a4")]))[0].v === false && (await refused(() => as(kid, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hi')", [l, h])));
  });
  await check("Another household's grown-up is not connected: Ann-Ben false, Ann-Dan false", async () =>
    (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("b1")]))[0].v === false && (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("d1")]))[0].v === false);
  await check("Dan, alone as a grown-up in House D, got no connection", async () => (await as(dan, "select * from my_connected_person_ids()")).length === 0);

  await check("Ann removes it, like any connection", async () => {
    const id = (await as(ann, "select id from my_connections() where full_name='Abe A'"))[0].id;
    await as(ann, "select remove_connection($1)", [id]);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a4")]))[0].v === false;
  });
  await check("Saving Abe's row with nothing changed does not bring it back", async () => {
    await db.exec(`update members set status = status, role = role where id = '${P("a4")}'`);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a4")]))[0].v === false;
  });
  await check("Even a real change later (Abe removed and reinstated) leaves a removed pair alone: the history row stands", async () => {
    await db.exec(`update members set status = 'removed' where id = '${P("a4")}'`);
    await db.exec(`update members set status = 'active' where id = '${P("a4")}'`);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a4")]))[0].v === false;
  });
  await check("Removed can be asked again, and mutual asks agree", async () => {
    await as(ann, "select request_connection($1)", [P("a4")]);
    await as(abe, "select request_connection($1)", [P("a1")]);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("a4")]))[0].v === true;
  });
  await check("connect_household_grownups is internal: not callable by a member", async () => refused(() => as(ann, "select connect_household_grownups($1)", [A])));
  await check("members_connect_grownups is a trigger function, not callable", async () => refused(() => as(ann, "select members_connect_grownups()")));
  await check("Ben (House B, its only grown-up) sees no connection from any of this", async () => (await as(ben, "select * from my_connections()")).length === 0);
}
