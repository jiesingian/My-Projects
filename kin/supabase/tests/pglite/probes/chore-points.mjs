const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
// Chore points and rewards (20260922053456, 20261007170000): a child can earn
// and ask, never award or answer.
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1");
  const annM = P("a1"), kidM = P("a2");
  const chore = (await db.query(`insert into routines (family_id, title, points) values ('${A}', 'Dishes', 5) returning id`)).rows[0].id;
  const reward = (await db.query(`insert into rewards (family_id, title, cost_points) values ('${A}', '30 min screen time', 50) returning id`)).rows[0].id;
  const tick = (who, approval, date = "current_date") =>
    as(who, `insert into routine_log (routine_id, family_id, occurrence_date, status, member_id, approval) values ($1, $2, ${date}, 'done', $3, '${approval}') returning approval, approved_by`, [chore, A, kidM]);

  await check("Kid's own tick claiming 'not_required' is saved as 'pending'", async () => {
    const r = (await tick(kid, "not_required"))[0];
    return r?.approval === "pending" || r;
  });
  await check("Kid cannot turn a pending tick into a counted one ('not_required' or 'approved')", async () => {
    await as(kid, "update routine_log set approval = 'not_required' where routine_id = $1", [chore]);
    // Refused by the policy or corrected by the trigger -- either way it stays pending.
    await as(kid, "update routine_log set approval = 'approved', approved_by = $2 where routine_id = $1", [chore, annM]).catch(() => null);
    const r = (await as(ann, "select approval, approved_by from routine_log where routine_id = $1", [chore]))[0];
    return (r?.approval === "pending" && r.approved_by === null) || r;
  });
  await check("Ann approves it; Kid can still skip a chore (earns nothing)", async () => {
    await as(ann, "update routine_log set approval = 'approved', approved_by = $2 where routine_id = $1", [chore, annM]);
    const r = (await as(kid, "select approval from routine_log where routine_id = $1", [chore]))[0];
    const s = (await as(kid, "insert into routine_log (routine_id, family_id, occurrence_date, status, member_id, approval) values ($1, $2, current_date - 1, 'skipped', $3, 'not_required') returning approval", [chore, A, kidM]))[0];
    return (r?.approval === "approved" && s?.approval === "not_required") || { r, s };
  });
  await check("A grown-up's tick still needs nobody", async () => {
    const r = (await as(ann, "insert into routine_log (routine_id, family_id, occurrence_date, status, member_id, approval) values ($1, $2, current_date - 2, 'done', $3, 'not_required') returning approval", [chore, A, annM]))[0];
    return r?.approval === "not_required" || r;
  });
  await check("Kid cannot change what a chore is worth; Ann can", async () => {
    const k = await refused(() => as(kid, "update routines set points = 100 where id = $1", [chore]), "Only a parent");
    await as(kid, "update routines set title = 'Dishes!' where id = $1", [chore]);
    await as(ann, "update routines set points = 8 where id = $1", [chore]);
    const r = (await as(ann, "select points, title from routines where id = $1", [chore]))[0];
    return (k === true && r?.points === 8 && r?.title === "Dishes!") || { k, r };
  });
  await check("Kid cannot set or change a reward's price", async () =>
    (await refused(() => as(kid, `insert into rewards (family_id, title, cost_points) values ('${A}', 'Bike', 1)`))) === true &&
    (await as(kid, "update rewards set cost_points = 1 where id = $1", [reward]).catch(() => [])) &&
    (await as(ann, "select cost_points from rewards where id = $1", [reward]))[0]?.cost_points === 50);
  let req;
  await check("Kid asks for a reward: pending, at the real price, no forged answer", async () => {
    req = (await as(kid, "insert into reward_redemptions (family_id, reward_id, member_id, cost_points, decided_by) values ($1, $2, $3, 50, $4) returning id, status, decided_by", [A, reward, kidM, annM]))[0];
    const cheap = await refused(() => as(kid, "insert into reward_redemptions (family_id, reward_id, member_id, cost_points) values ($1, $2, $3, 1)", [A, reward, kidM]));
    const granted = await refused(() => as(kid, "insert into reward_redemptions (family_id, reward_id, member_id, cost_points, status) values ($1, $2, $3, 50, 'granted')", [A, reward, kidM]));
    const forOthers = await refused(() => as(kid, "insert into reward_redemptions (family_id, reward_id, member_id, cost_points) values ($1, $2, $3, 50)", [A, reward, annM]));
    return (req?.status === "pending" && req.decided_by === null && cheap === true && granted === true && forOthers === true) || { req, cheap, granted, forOthers };
  });
  await check("Kid cannot answer or withdraw their own request; Ann can answer", async () => {
    const self = await refused(() => as(kid, "update reward_redemptions set status = 'refused' where id = $1", [req.id]));
    await as(kid, "delete from reward_redemptions where id = $1", [req.id]);
    await as(ann, "update reward_redemptions set status = 'granted', decided_by = $2 where id = $1", [req.id, annM]);
    const r = (await as(kid, "select status from reward_redemptions where id = $1", [req.id]))[0];
    return (self === true && r?.status === "granted") || { self, r };
  });
  await check("Another household sees none of it and can't write to it", async () =>
    (await as(ben, "select 1 from routine_log")).length === 0 &&
    (await as(ben, "select 1 from reward_redemptions")).length === 0 &&
    (await as(ben, "select 1 from rewards")).length === 0 &&
    (await refused(() => as(ben, "insert into reward_redemptions (family_id, reward_id, member_id, cost_points) values ($1, $2, $3, 50)", [A, reward, P("b1")]))) === true);
}
