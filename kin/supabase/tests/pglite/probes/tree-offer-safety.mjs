// A limit on tree offers, blocking a household's offers, and "has an account"
// on a shared branch (20261011100000_tree_offer_limits_blocks_accounts.sql).
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const C = "c0000000-0000-0000-0000-000000000000";
const T = (s) => `7ee00000-0000-0000-0000-0000000000${s}`;
const BEN_MEMBER = "00000000-0000-0000-0000-0000000000b1";
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), cat = U("c1"), dan = U("d1");
  const nums = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0"));
  await db.exec(`
    insert into family_tree_people (id, family_id, full_name) values
      ${nums.map((n) => `('${T(n)}', '${A}', 'Relative ${n}')`).join(",")},
      ('${T("31")}', '${B}', 'Ben Parent'),
      ('${T("32")}', '${B}', 'Ben Cousin');
    insert into family_tree_people (id, family_id, full_name, father_id, member_id)
      values ('${T("33")}', '${B}', 'Ben Himself', '${T("31")}', '${BEN_MEMBER}');
    insert into family_tree_people (id, family_id, full_name) values ('${T("41")}', '${C}', 'Cat Relative');
  `);
  const offer = (who, person, to) => as(who, "select offer_tree_person($1, $2) as id", [person, to]);

  // ── blocking ────────────────────────────────────────────────────────────
  let first, second;
  await check("Ann offers two relatives to House B", async () => {
    first = (await offer(ann, T("01"), B))[0].id;
    second = (await offer(ann, T("02"), B))[0].id;
    return !!first && !!second && first !== second;
  });
  await check("A child cannot block an offer", async () => {
    await db.exec(`insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id) values ('${B}', '${T("31")}', '${A}')`);
    const m = (await db.query(`select id from family_tree_matches where offer_family_id = '${B}' and to_family_id = '${A}'`)).rows[0].id;
    return refused(() => as(kid, "select block_tree_offers($1)", [m]));
  });
  await check("Only the household that was offered can block: a stranger cannot", async () => refused(() => as(dan, "select block_tree_offers($1)", [first])));
  await check("…and the household that made the offer cannot block it", async () => refused(() => as(ann, "select block_tree_offers($1)", [first])));
  await check("Ben blocks House A: both waiting offers are declined", async () => {
    await as(ben, "select block_tree_offers($1)", [first]);
    const rows = await db.query(`select status from family_tree_matches where offer_family_id = '${A}' and to_family_id = '${B}'`);
    return rows.rows.length === 2 && rows.rows.every((r) => r.status === "declined");
  });
  await check("Ben sees who he has blocked, by name", async () => {
    const r = await as(ben, "select family_name from tree_offer_blocks_for_me()");
    return r.length === 1 && r[0].family_name === "House A";
  });
  await check("House A cannot see that it was blocked", async () => {
    const t = await as(ann, "select 1 from family_tree_offer_blocks");
    const f = await as(ann, "select 1 from tree_offer_blocks_for_me()");
    return t.length === 0 && f.length === 0;
  });
  await check("Ann cannot offer another relative to House B", async () => refused(() => offer(ann, T("03"), B), "not taking relatives"));
  await check("…but the block is one way: Ben can still offer to House A", async () => !!(await offer(ben, T("32"), A))[0].id);
  await check("Nobody writes a block directly", async () =>
    refused(() => as(ann, "insert into family_tree_offer_blocks (family_id, blocked_family_id) values ($1, $2)", [A, B])));
  await check("Nobody removes one directly, and a stranger's unblock does not touch it", async () => {
    await as(ben, "delete from family_tree_offer_blocks").catch(() => null);
    await as(dan, "select unblock_tree_offers($1)", [A]);
    return (await as(ben, "select 1 from tree_offer_blocks_for_me()")).length === 1;
  });
  await check("A child cannot unblock", async () => refused(() => as(U("b2"), "select unblock_tree_offers($1)", [A])));
  await check("Ben unblocks, and Ann can offer again", async () => {
    await as(ben, "select unblock_tree_offers($1)", [A]);
    return !!(await offer(ann, T("03"), B))[0].id;
  });

  // ── the limit on waiting offers ─────────────────────────────────────────
  await check("Fifteen waiting offers to one household are allowed", async () => {
    let last;
    for (const n of nums.slice(3, 17)) last = (await offer(ann, T(n), C))[0].id; // 14 more to C
    last = (await offer(ann, T("18"), C))[0].id; // 15th to C
    return !!last;
  });
  await check("The sixteenth is refused, with a message that says why", async () => refused(() => offer(ann, T("19"), C), "15 of your relatives"));
  await check("Offering somebody already waiting is still fine at the limit", async () => !!(await offer(ann, T("04"), C))[0].id);
  await check("The limit is per household: House B can still be offered one", async () => !!(await offer(ann, T("20"), B))[0].id);
  await check("A stranger's household is never offered to", async () => refused(() => offer(ann, T("19"), "d0000000-0000-0000-0000-000000000000")));

  // ── the daily limit ─────────────────────────────────────────────────────
  await check("Forty offers in a day is the most, whoever they went to", async () => {
    await db.exec(`
      insert into family_tree_matches (offer_family_id, offer_person_id, to_family_id, status, offered_at)
      select '${A}', '${T("20")}', '${B}', 'declined', now() from generate_series(1, 40)`);
    return refused(() => offer(ann, T("19"), B), "a lot of relatives");
  });
  await check("Older offers do not count against today", async () => {
    await db.exec(`update family_tree_matches set offered_at = now() - interval '2 days' where status = 'declined' and offer_family_id = '${A}'`);
    return !!(await offer(ann, T("19"), B))[0].id;
  });

  // ── who has an account on a shared branch ──────────────────────────────────────
  await check("A shared branch says who has an account, and only that", async () => {
    const m = (await offer(ann, T("05"), B))[0].id;
    await as(ben, "select respond_tree_offer($1, true, $2)", [m, T("33")]);
    const rows = await as(ann, "select id, has_account from shared_branch_accounts($1)", [m]);
    const root = rows.find((r) => r.id === T("33"));
    const parent = rows.find((r) => r.id === T("31"));
    return root?.has_account === true && parent?.has_account === false;
  });
  await check("A household outside the match gets no branch at all", async () => {
    const m = (await db.query(`select id from family_tree_matches where status = 'accepted' limit 1`)).rows[0].id;
    return (await as(cat, "select * from shared_branch_accounts($1)", [m])).length === 0 && (await as(dan, "select * from shared_branch_accounts($1)", [m])).length === 0;
  });
}
