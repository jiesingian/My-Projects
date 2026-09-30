const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2");
  // House D: Dan (adult) and Dee (child). Ben (House B) is in Kid's tree.
  let c;
  await check("Kid asks Ben; Ben accepts -> awaiting_guardian, not connected", async () => {
    c = (await as(kid, "select request_connection($1) id", [P("b1")]))[0].id;
    await as(ben, "select respond_connection($1, true)", [c]);
    const st = (await as(kid, "select status from my_connections() where id=$1", [c]))[0].status;
    const conn = (await as(kid, "select are_connected($1,$2) v", [P("a2"), P("b1")]))[0].v;
    return (st === "awaiting_guardian" && conn === false) || { st, conn };
  });
  await check("Kid cannot DM Ben yet", async () => {
    const [lo, hi] = [P("a2"), P("b1")].sort();
    return refused(() => as(kid, "insert into direct_messages (person_low, person_high, body) values ($1,$2,'hi')", [lo, hi]));
  });
  await check("Ann (Kid's parent) sees it in children_connections; Ben and Dan do not", async () => {
    const a = await as(ann, "select child_name, other_name, status from children_connections()");
    const b = await as(ben, "select * from children_connections()");
    const d = await as(dan, "select * from children_connections()");
    return (a.length === 1 && a[0].other_name === "Ben B" && a[0].status === "awaiting_guardian" && b.length === 0 && d.length === 0) || { a, b, d };
  });
  await check("Ben (the other side) cannot approve; Dan (another household's adult) cannot", async () =>
    (await refused(() => as(ben, "select guardian_decide_connection($1, true)", [c]), "Only a parent")) === true &&
    (await refused(() => as(dan, "select guardian_decide_connection($1, true)", [c]), "Only a parent")) === true);
  await check("Kid cannot approve their own", async () => refused(() => as(kid, "select guardian_decide_connection($1, true)", [c]), "Only a parent"));
  await check("Ann approves -> connected", async () => {
    await as(ann, "select guardian_decide_connection($1, true)", [c]);
    return (await as(kid, "select are_connected($1,$2) v", [P("a2"), P("b1")]))[0].v === true;
  });
  await check("Ann can remove Kid's connection", async () => {
    await as(ann, "select guardian_remove_connection($1)", [c]);
    return (await as(kid, "select are_connected($1,$2) v", [P("a2"), P("b1")]))[0].v === false;
  });
  await check("Ann cannot remove a grown-up's connection via guardian path", async () => {
    const code = (await as(dan, "select my_connection_code() c"))[0].c;
    const id = (await as(ben, "select request_connection_by_code($1) id", [code]))[0].id;
    await as(dan, "select respond_connection($1, true)", [id]);
    const st = (await as(ben, "select status from my_connections() where id=$1", [id]))[0].status;
    return st === "accepted" && (await refused(() => as(ann, "select guardian_remove_connection($1)", [id]), "Only a parent")) === true;
  });
  await check("Grown-up to grown-up still accepts straight away (Ann-Ben)", async () => {
    const id = (await as(ann, "select request_connection($1) id", [P("b1")]))[0].id;
    await as(ben, "select respond_connection($1, true)", [id]);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("b1")]))[0].v === true;
  });
  await check("A child and a grown-up of their own household connect without approval (Dee-Dan)", async () => {
    await as(dee, "select request_connection($1)", [P("d1")]);
    await as(dan, "select request_connection($1)", [P("d2")]);
    return (await as(dee, "select are_connected($1,$2) v", [P("d2"), P("d1")]))[0].v === true;
  });
  await check("Kid and Ann (own parent) connect straight away", async () => {
    const id = (await as(kid, "select request_connection($1) id", [P("a1")]))[0].id;
    await as(ann, "select respond_connection($1, true)", [id]);
    return (await as(kid, "select are_connected($1,$2) v", [P("a2"), P("a1")]))[0].v === true;
  });
}
