// Per-person budgets and net-worth snapshots (20260930140000). Budgets: the
// household reads them, only a grown-up writes them, in their own name, for
// someone in their own household. Snapshots: each row is its viewer's alone.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const budget = (member, setBy, amount = 25000, month = 9) =>
  `insert into member_budgets (family_id, member_id, period_year, period_month, amount, set_by) values ('${A}', '${member}', 2026, ${month}, ${amount}, '${setBy}') returning id`;
const snapshot = (viewer, scope = "all", month = "2026-09-01", net = 1000) =>
  `insert into net_worth_snapshots (viewer_member_id, family_id, scope, month, net_worth) values ('${viewer}', '${A}', '${scope}', '${month}', ${net})
   on conflict (viewer_member_id, scope, month) do update set net_worth = excluded.net_worth returning net_worth`;

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");

  await check("Ann (a parent) sets Kid's budget; Abe (an adult) sets Ann's", async () =>
    (await as(ann, budget(P("a2"), P("a1"), 1500))).length === 1 && (await as(abe, budget(P("a1"), P("a4")))).length === 1);
  await check("The whole household reads them, Kid included", async () =>
    (await as(kid, "select 1 from member_budgets")).length === 2 && (await as(abe, "select 1 from member_budgets")).length === 2);
  await check("Ben (linked household) and Dan (stranger) read none", async () =>
    (await as(ben, "select 1 from member_budgets")).length === 0 && (await as(dan, "select 1 from member_budgets")).length === 0);
  await check("Kid cannot set, raise or remove a budget", async () =>
    (await refused(() => as(kid, budget(P("a2"), P("a2"), 99999, 10)))) === true &&
    (await as(kid, `update member_budgets set amount = 99999, set_by = '${P("a2")}' returning id`)).length === 0 &&
    (await as(kid, "delete from member_budgets returning id")).length === 0);
  await check("Abe cannot write one in Ann's name (forged setter)", async () => refused(() => as(abe, budget(P("a2"), P("a1"), 1, 11))));
  await check("Ann cannot budget someone in another household", async () => refused(() => as(ann, budget(P("d1"), P("a1"), 1, 12))));
  await check("Dan cannot write a budget into House A", async () => refused(() => as(dan, budget(P("a1"), P("d1"), 1, 12))));
  await check("One budget per person per month", async () => refused(() => as(ann, budget(P("a2"), P("a1"), 2000))));

  await check("Ann keeps her own month up to date, twice over", async () =>
    Number((await as(ann, snapshot(P("a1"), "all", "2026-09-01", 1000)))[0].net_worth) === 1000 &&
    Number((await as(ann, snapshot(P("a1"), "all", "2026-09-01", 1200)))[0].net_worth) === 1200);
  await check("Abe, in the same house, sees none of Ann's line", async () => (await as(abe, "select 1 from net_worth_snapshots")).length === 0);
  await check("Abe cannot write or overwrite a row as Ann", async () =>
    (await refused(() => as(abe, snapshot(P("a1"), "family")))) === true &&
    (await as(abe, `update net_worth_snapshots set net_worth = 1 where viewer_member_id = '${P("a1")}' returning 1`)).length === 0);
  await check("Dan cannot write a row into House A", async () => refused(() => as(dan, snapshot(P("d1")))));
  await check("A month must be the first of the month", async () => refused(() => as(ann, snapshot(P("a1"), "all", "2026-09-15"))));
}
