// The remittance log (20260930130000): grown-ups only, "Just me" is the
// recorder's alone, nothing crosses households, and the money-in lands and
// leaves with its remittance. The same cases, and more, run against dev in
// ../../rls_remittances.sql.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const JOINT = "a4000000-0000-0000-0000-000000000001";
const ANN_OWN = "a4000000-0000-0000-0000-000000000002";
const DAN_BANK = "d4000000-0000-0000-0000-000000000001";

const log = (who, { sender = null, name = "Kuya Ben", account = null, justMe = false, allocations = [], received = 5600 } = {}) =>
  `select log_remittance(${sender ? `'${sender}'` : "null"}, '${name}', null, 100, 'USD', '2026-09-20', null, null, null, ${received}, 'bank', null, ${account ? `'${account}'` : "null"}, null, ${justMe}, '${JSON.stringify(allocations)}') id`;

export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");

  let shared, mine;
  await check("Ann logs one into the joint account; the money-in lands there", async () => {
    shared = (await as(ann, log(ann, { account: JOINT, allocations: [{ purpose: "Tuition", amount: 3000 }] })))[0].id;
    const tx = await as(abe, "select t.amount from wealth_transactions t join remittances r on r.transaction_id = t.id where r.id = $1 and t.account_id = $2 and t.source_table = 'remittances'", [shared, JOINT]);
    return (tx.length === 1 && Number(tx[0].amount) === 5600) || tx;
  });
  await check("Ann logs a Just-me one into her own account", async () => {
    mine = (await as(ann, log(ann, { account: ANN_OWN, justMe: true, allocations: [{ purpose: "Medicine", amount: 1000 }] })))[0].id;
    return typeof mine === "string";
  });

  await check("Abe (another grown-up) sees the household one", async () => (await as(abe, "select 1 from remittances where id = $1", [shared])).length === 1);
  await check("Abe sees neither Ann's Just-me one nor what it went to", async () =>
    (await as(abe, "select 1 from remittances where id = $1", [mine])).length === 0 &&
    (await as(abe, "select 1 from remittance_allocations where remittance_id = $1", [mine])).length === 0);
  await check("Abe cannot edit or delete Ann's Just-me one", async () =>
    (await as(abe, "update remittances set php_received = 1 where id = $1 returning id", [mine])).length === 0 &&
    (await refused(() => as(abe, "select delete_remittance($1)", [mine]), "remittance_not_found")) === true);
  await check("Kid sees and writes nothing", async () =>
    (await as(kid, "select 1 from remittances")).length === 0 &&
    (await as(kid, "select 1 from remittance_allocations")).length === 0 &&
    (await refused(() => as(kid, log(kid)))) === true);
  await check("Ben (linked household) and Dan (stranger) see nothing of House A's", async () =>
    (await as(ben, "select 1 from remittances")).length === 0 && (await as(dan, "select 1 from remittances")).length === 0);
  await check("Dan cannot write into House A, even naming himself recorder", async () =>
    refused(() => as(dan, `insert into remittances (family_id, sender_name, amount, currency, sent_on, php_received, channel, recorded_by) values ('${A}', 'x', 1, 'USD', '2026-09-01', 1, 'bank', '${P("d1")}')`)));
  await check("Abe cannot record one in Ann's name (forged recorder)", async () =>
    refused(() => as(abe, `insert into remittances (family_id, sender_name, amount, currency, sent_on, php_received, channel, recorded_by) values ('${A}', 'x', 1, 'USD', '2026-09-01', 1, 'bank', '${P("a1")}')`)));
  await check("A Just-me one cannot land in a joint account", async () => refused(() => as(ann, log(ann, { account: JOINT, justMe: true }))));
  await check("Abe cannot land one in Ann's own account", async () => refused(() => as(abe, log(abe, { account: ANN_OWN }))));
  await check("Ann cannot land one in another household's account", async () => refused(() => as(ann, log(ann, { account: DAN_BANK }))));
  await check("Ann cannot name Dee (a stranger's child) as the sender", async () => refused(() => as(ann, log(ann, { sender: P("d2") }))));
  await check("What it went to cannot add up to more than arrived", async () =>
    refused(() => as(ann, log(ann, { allocations: [{ purpose: "Tuition", amount: 6000 }] })), "remittance_over_allocated"));
  await check("A joint-account remittance cannot be flipped to Just me", async () =>
    refused(() => as(ann, "update remittances set is_private = true where id = $1", [shared])));
  await check("Deleting it takes its money-in with it", async () => {
    await as(ann, "select delete_remittance($1)", [shared]);
    return (await as(ann, "select 1 from wealth_transactions where source_table = 'remittances' and account_id = $1", [JOINT])).length === 0;
  });
}
