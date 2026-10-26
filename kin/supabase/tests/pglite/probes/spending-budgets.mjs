// Category budgets for Family and each person (20261026100000): grown-ups set
// Family's and the children's; a grown-up's own is theirs alone and, made
// private, seen only by the people they name; a child with a login sets
// their own; other households see and write nothing.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const annM = P("a1"), kidM = P("a2"), babyM = P("a3"), abeM = P("a4");

  const set = (who, by, member, category = "Groceries", family = A) =>
    as(
      who,
      "insert into spending_budgets (family_id, member_id, category, amount, from_month, set_by) values ($1, $2, $3, 5000, '2026-12-01', $4) returning id",
      [family, member, category, by],
    );
  const sees = async (who, member) =>
    (await as(who, member === null ? "select 1 from spending_budgets where member_id is null" : "select 1 from spending_budgets where member_id = $1", member === null ? [] : [member])).length;

  await check("A grown-up sets Family's; the whole household sees it", async () =>
    (await set(abe, abeM, null)).length === 1 && (await sees(ann, null)) >= 1 && (await sees(kid, null)) === (await sees(ann, null)));
  await check("One budget per whose, category and month (Family's too)", async () => refused(() => set(ann, annM, null)));
  await check("A child cannot set Family's", async () => refused(() => set(kid, kidM, null, "Snacks")));

  await check("Ann sets her own; Abe (a grown-up) sees it while it is open", async () =>
    (await set(ann, annM, annM)).length === 1 && (await sees(abe, annM)) === 1);
  await check("Nobody else edits a grown-up's budget", async () =>
    (await refused(() => set(abe, abeM, annM, "Dining"))) === true &&
    (await as(abe, "update spending_budgets set amount = 1 where member_id = $1 returning 1", [annM])).length === 0 &&
    (await as(abe, "delete from spending_budgets where member_id = $1 returning 1", [annM])).length === 0);
  await check("A child does not see a grown-up's budget", async () => (await sees(kid, annM)) === 0);

  await check("Made private, Ann's is hers alone; Abe no longer sees it", async () =>
    (await as(ann, "insert into budget_sharing (member_id, family_id, is_private) values ($1, $2, true) returning 1", [annM, A])).length === 1 &&
    (await sees(abe, annM)) === 0 && (await sees(ann, annM)) === 1);
  await check("Abe cannot change Ann's sharing choice", async () =>
    (await refused(() => as(abe, "insert into budget_sharing (member_id, family_id, is_private) values ($1, $2, false)", [annM, A]))) === true &&
    (await as(abe, "update budget_sharing set is_private = false where member_id = $1 returning 1", [annM])).length === 0);
  await check("Ann names Kid as a viewer: Kid sees it, Abe still not", async () =>
    (await as(ann, "insert into budget_viewers (owner_member_id, viewer_member_id, family_id) values ($1, $2, $3) returning 1", [annM, kidM, A])).length === 1 &&
    (await sees(kid, annM)) === 1 && (await sees(abe, annM)) === 0);
  await check("Viewers: never oneself, never someone with no login, never named by another", async () =>
    (await refused(() => as(ann, "insert into budget_viewers (owner_member_id, viewer_member_id, family_id) values ($1, $1, $2)", [annM, A]))) === true &&
    (await refused(() => as(ann, "insert into budget_viewers (owner_member_id, viewer_member_id, family_id) values ($1, $2, $3)", [annM, babyM, A]))) === true &&
    (await refused(() => as(abe, "insert into budget_viewers (owner_member_id, viewer_member_id, family_id) values ($1, $2, $3)", [annM, abeM, A]))) === true);
  await check("Abe sees no viewer list of Ann's", async () => (await as(abe, "select 1 from budget_viewers")).length === 0);

  await check("A grown-up sets a managed child's; the grown-ups see it, the sibling not", async () =>
    (await set(abe, abeM, babyM)).length === 1 && (await sees(ann, babyM)) === 1 && (await sees(kid, babyM)) === 0);
  await check("A child with a login sets their own, and a grown-up can change it", async () =>
    (await set(kid, kidM, kidM)).length === 1 &&
    (await as(ann, "update spending_budgets set amount = 3000, set_by = $2 where member_id = $1 returning 1", [kidM, annM])).length === 1 &&
    (await sees(kid, kidM)) === 1);
  await check("A child cannot set a grown-up's or a sibling's", async () =>
    (await refused(() => set(kid, kidM, annM, "Dining"))) === true && (await refused(() => set(kid, kidM, babyM, "Dining"))) === true);
  await check("Nobody writes in someone else's name", async () => refused(() => set(ann, abeM, null, "Dining")));
  await check("Bad amounts and months are refused", async () =>
    (await refused(() => as(ann, "insert into spending_budgets (family_id, member_id, category, amount, from_month, set_by) values ($1, null, 'x', -1, '2026-10-01', $2)", [A, annM]))) === true &&
    (await refused(() => as(ann, "insert into spending_budgets (family_id, member_id, category, amount, from_month, set_by) values ($1, null, 'x', 1, '2026-10-02', $2)", [A, annM]))) === true);

  await check("Ben (linked) and Dan (stranger) see nothing of House A's", async () =>
    (await as(ben, "select 1 from spending_budgets")).length === 0 &&
    (await as(dan, "select 1 from spending_budgets")).length === 0 &&
    (await as(dan, "select 1 from budget_sharing")).length === 0 &&
    (await as(dan, "select 1 from budget_viewers")).length === 0);
  await check("Dan cannot write into House A or set a budget for its people", async () =>
    (await refused(() => set(dan, P("d1"), null, "Groceries", A))) === true &&
    (await refused(() => set(dan, P("d1"), babyM, "Groceries", D))) === true &&
    (await as(dan, "update spending_budgets set amount = 1 returning 1")).length === 0 &&
    (await as(dan, "delete from spending_budgets returning 1")).length === 0);

  // spending_budgets_sweep_former_member: a deleted account's budgets,
  // sharing choice and viewer rows go; Family's and others' stay.
  await check("spending_budgets_sweep_former_member: a deleted account's budgets and sharing go with it", async () => {
    await db.exec("reset role");
    await db.query("update members set auth_user_id = null, status = 'removed', full_name = 'Former member' where id = $1", [annM]);
    const left = (await db.query("select member_id from spending_budgets")).rows.map((r) => r.member_id);
    const sharing = (await db.query("select 1 from budget_sharing")).rows.length;
    const viewers = (await db.query("select 1 from budget_viewers")).rows.length;
    return (!left.includes(annM) && left.includes(null) && left.includes(kidM) && sharing === 0 && viewers === 0) || { left, sharing, viewers };
  });
}
