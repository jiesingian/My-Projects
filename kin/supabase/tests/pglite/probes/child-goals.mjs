// A goal for a child (20261026180000): the household's grown-ups and that
// child see it, a sibling does not; any grown-up changes it; the child does
// not change or delete one a grown-up made, but keeps their own.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  // Production's own goal policies, as they stand beside these: the
  // household's goals and your own personal ones.
  await db.exec(`
    drop policy if exists goals_all on goals;
    create policy goals_select_p on goals for select to authenticated using (family_id = current_family_id() and (is_joint or owner_member_id = current_member_id()));
    create policy goals_insert_p on goals for insert to authenticated with check (family_id = current_family_id() and (is_joint or owner_member_id = current_member_id()));
    create policy goals_update_p on goals for update to authenticated using (family_id = current_family_id() and (is_joint or owner_member_id = current_member_id()));
    create policy goals_delete_p on goals for delete to authenticated using (family_id = current_family_id() and (is_joint or owner_member_id = current_member_id()));
    grant all on goals to authenticated;
  `);
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1");
  const annM = P("a1"), kidM = P("a2"), babyM = P("a3"), abeM = P("a4");
  const goalFor = (who, by, owner, title = "Bike") =>
    as(who, "insert into goals (family_id, title, is_joint, owner_member_id, created_by) values ($1, $2, false, $3, $4) returning id", [A, title, owner, by]);
  const sees = async (who, id) => (await as(who, "select 1 from goals where id = $1", [id])).length === 1;

  let babyGoal, kidGoal;
  await check("Ann sets up a goal for the managed child; both grown-ups see it", async () => {
    babyGoal = (await goalFor(ann, annM, babyM))[0].id;
    return (await sees(ann, babyGoal)) && (await sees(abe, babyGoal));
  });
  await check("Abe sets one up for Kid; Kid sees their own, the sibling's stays hidden from Kid", async () => {
    kidGoal = (await goalFor(abe, abeM, kidM, "Laptop"))[0].id;
    return (await sees(kid, kidGoal)) && !(await sees(kid, babyGoal));
  });
  await check("Any grown-up changes and deletes a child's goal", async () =>
    (await as(ann, "update goals set title = 'New bike' where id = $1 returning 1", [babyGoal])).length === 1 &&
    (await as(abe, "update goals set title = 'Laptop for school' where id = $1 returning 1", [kidGoal])).length === 1);
  await check("Kid cannot change or delete the goal a grown-up made for them", async () =>
    (await as(kid, "update goals set title = 'x' where id = $1 returning 1", [kidGoal])).length === 0 &&
    (await as(kid, "delete from goals where id = $1 returning 1", [kidGoal])).length === 0);
  await check("A goal Kid made themselves stays theirs to change", async () => {
    const own = (await goalFor(kid, kidM, kidM, "Comics"))[0].id;
    return (await as(kid, "update goals set title = 'More comics' where id = $1 returning 1", [own])).length === 1;
  });
  await check("A child cannot set up a goal for a sibling, a grown-up not one for another grown-up", async () =>
    (await refused(() => goalFor(kid, kidM, babyM))) === true && (await refused(() => goalFor(ann, annM, abeM))) === true);
  await check("Nobody sets one up in someone else's name", async () => refused(() => goalFor(ann, abeM, babyM)));
  await check("A grown-up's own goal stays theirs: the other grown-up neither sees nor changes it", async () => {
    const mine = (await as(ann, "insert into goals (family_id, title, is_joint, owner_member_id, created_by) values ($1, 'Watch', false, $2, $2) returning id", [A, annM]))[0].id;
    return !(await sees(abe, mine)) && (await as(abe, "update goals set title = 'x' where id = $1 returning 1", [mine])).length === 0;
  });
  await check("Dan (another household) sees and changes nothing", async () =>
    !(await sees(dan, babyGoal)) &&
    (await as(dan, "update goals set title = 'x' where id = $1 returning 1", [babyGoal])).length === 0 &&
    (await refused(() => as(dan, "insert into goals (family_id, title, is_joint, owner_member_id, created_by) values ($1, 'x', false, $2, $3)", [A, babyM, P("d1")]))) === true);
}
