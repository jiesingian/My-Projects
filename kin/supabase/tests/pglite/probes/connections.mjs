const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1"), dee = U("d2");
  await check("Ann's candidates: Kid and Ben only (not Baby w/o login, not Cat's non-sharing house, not strangers)", async () => {
    const r = await as(ann, "select full_name from connection_candidates() order by 1");
    return JSON.stringify(r.map((x) => x.full_name)) === '["Ben B","Kid A"]' || r;
  });
  await check("Dan (stranger) sees only his own household", async () => { const r = await as(dan, "select full_name from connection_candidates()"); return (r.length === 1 && r[0].full_name === "Dee D") || r; });
  await check("Ann cannot request Dan (not in tree)", async () => refused(() => as(ann, "select request_connection($1)", [P("d1")]), "not in your family tree"));
  await check("Ann cannot request Cat (linked but not sharing)", async () => refused(() => as(ann, "select request_connection($1)", [P("c1")]), "not in your family tree"));
  await check("Direct insert into connections refused", async () => refused(() => as(ann, "insert into connections (requester_person_id, addressee_person_id, status) values ($1,$2,'accepted')", [P("a1"), P("d1")])));
  let annBen;
  await check("Ann requests Ben", async () => { annBen = (await as(ann, "select request_connection($1) id", [P("b1")]))[0].id; return !!annBen; });
  await check("Asking twice returns the same row", async () => (await as(ann, "select request_connection($1) id", [P("b1")]))[0].id === annBen);
  await check("Ben sees incoming request with Ann's name", async () => {
    const r = await as(ben, "select full_name, incoming, status from my_connections()");
    return (r.length === 1 && r[0].full_name === "Ann A" && r[0].incoming && r[0].status === "pending") || r;
  });
  await check("Dan sees nothing of it", async () => (await as(dan, "select * from connections")).length === 0 && (await as(dan, "select * from my_connections()")).length === 0);
  await check("Kid (Ann's household) cannot see Ann's connection row", async () => (await as(kid, "select * from connections")).length === 0);
  await check("Ann cannot accept her own request", async () => refused(() => as(ann, "select respond_connection($1, true)", [annBen]), "no longer open"));
  await check("Dan cannot remove it", async () => refused(() => as(dan, "select remove_connection($1)", [annBen]), "not yours"));
  await check("Ben accepts", async () => { await as(ben, "select respond_connection($1, true)", [annBen]); return true; });
  await check("are_connected(Ann, Ben) true for Ben", async () => (await as(ben, "select are_connected($1,$2) v", [P("a1"), P("b1")]))[0].v === true);
  await check("are_connected(Ann, Ben) false when Dan asks (not his pair)", async () => (await as(dan, "select are_connected($1,$2) v", [P("a1"), P("b1")]))[0].v === false);
  await check("Ann's my_connected_person_ids is [Ben]", async () => { const r = await as(ann, "select * from my_connected_person_ids() v"); return (r.length === 1 && r[0].v === P("b1")) || r; });
  await check("Ben no longer a candidate for Ann", async () => !(await as(ann, "select full_name from connection_candidates()")).some((r) => r.full_name === "Ben B"));

  // codes
  await check("A child cannot get a code", async () => refused(() => as(kid, "select my_connection_code()"), "grown-ups"));
  let code;
  await check("Dan gets a code, same one twice", async () => {
    code = (await as(dan, "select my_connection_code() c"))[0].c;
    const again = (await as(dan, "select my_connection_code() c"))[0].c;
    return (/^[A-Z2-9]{8}$/.test(code) && code === again) || [code, again];
  });
  await check("Only Dan can read his code row", async () => (await as(ann, "select * from connection_codes")).length === 0 && (await as(dan, "select * from connection_codes")).length === 1);
  await check("A child cannot use a code", async () => refused(() => as(kid, "select request_connection_by_code($1)", [code]), "grown-ups"));
  await check("Wrong code refused", async () => refused(() => as(ann, "select request_connection_by_code('ZZZZZZZZ')"), "No one has that code"));
  let annDan;
  await check("Ann asks Dan by code (lowercase, spaces)", async () => { annDan = (await as(ann, "select request_connection_by_code($1) id", [` ${code.toLowerCase()} `]))[0].id; return !!annDan; });
  await check("Ann does NOT see Dan's name while pending by code", async () => {
    const r = (await as(ann, "select * from my_connections() where id=$1", [annDan]))[0];
    return (r.full_name === null && r.member_id === null && r.household_name === null) || r;
  });
  await check("Dan sees Ann's name (she asked)", async () => (await as(dan, "select full_name from my_connections() where id=$1", [annDan]))[0].full_name === "Ann A");
  await check("Ann can withdraw her pending request", async () => { await as(ann, "select remove_connection($1)", [annDan]); return (await as(dan, "select * from my_connections()")).length === 0; });
  await check("Ann asks again; Dan declines", async () => {
    annDan = (await as(ann, "select request_connection_by_code($1) id", [code]))[0].id;
    await as(dan, "select respond_connection($1, false)", [annDan]);
    return (await as(ann, "select * from my_connections() where id=$1", [annDan])).length === 0;
  });
  await check("Dan cannot remove a pending request made to him (decline instead)... via remove", async () => {
    const id = (await as(ann, "select request_connection_by_code($1) id", [code]))[0].id;
    const r = await refused(() => as(dan, "select remove_connection($1)", [id]), "not yours");
    await as(dan, "select respond_connection($1, true)", [id]);
    return r;
  });
  await check("After accept, Ann sees Dan's name and household", async () => {
    const r = (await as(ann, "select full_name, household_name from my_connections() where status='accepted' and full_name='Dan D'"));
    return (r.length === 1 && r[0].household_name === "House D") || r;
  });
  await check("New code invalidates the old one", async () => {
    const fresh = (await as(dan, "select my_connection_code(true) c"))[0].c;
    return fresh !== code && (await refused(() => as(ben, "select request_connection_by_code($1)", [code]), "No one has that code"));
  });
  await check("Mutual asks agree: Kid asks Ann, Ann asks Kid -> accepted", async () => {
    await as(kid, "select request_connection($1)", [P("a1")]);
    await as(ann, "select request_connection($1)", [P("a2")]);
    return (await as(kid, "select are_connected($1,$2) v", [P("a1"), P("a2")]))[0].v === true;
  });
  await check("Either side can remove an accepted one (Ben removes Ann)", async () => {
    await as(ben, "select remove_connection($1)", [annBen]);
    return (await as(ann, "select are_connected($1,$2) v", [P("a1"), P("b1")]))[0].v === false;
  });
  await check("Removed can be asked again", async () => !!(await as(ann, "select request_connection($1) id", [P("b1")]))[0].id);
  await check("Internal helpers not callable", async () => refused(() => as(ann, "select person_active_member($1)", [P("b1")])));
  await check("Signed-out sees nothing", async () => refused(() => as("", "select * from my_connections()")) === true || (await as("", "select * from my_connections()")).length === 0);
  await check("Anon role cannot call my_connections", async () => {
    await db.exec("reset role"); await db.exec("set role anon");
    try { await db.query("select * from my_connections()"); return "allowed"; } catch { return true; } finally { await db.exec("reset role"); }
  });
}
