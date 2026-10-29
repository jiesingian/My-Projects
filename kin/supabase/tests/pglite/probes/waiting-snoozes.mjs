const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
// "Not now" on "Waiting on you", per person (20261029180000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), stranger = U("ff");
  const snooze = (who, member, family, key = "asset-x", until = "2026-11-28") =>
    as(who, "insert into waiting_snoozes (member_id, family_id, item_key, until) values ($1, $2, $3, $4)", [member, family, key, until]);
  const mine = async (who) => (await as(who, "select member_id, item_key from waiting_snoozes")).map((r) => `${r.member_id}|${r.item_key}`);

  await check("Ann puts two items away and sees exactly those", async () => {
    await snooze(ann, M("a1"), A);
    await snooze(ann, M("a1"), A, "loan-y");
    const r = await mine(ann);
    return (r.length === 2 && r.every((x) => x.startsWith(M("a1")))) || r;
  });
  await check("A child sees none of Ann's", async () => (await mine(kid)).length === 0);
  await check("Nobody snoozes in someone else's name, or under another household", async () => {
    const a = await refused(() => snooze(ann, M("a2"), A, "z"));
    const b = await refused(() => snooze(ben, M("a1"), A, "z"));
    const c = await refused(() => snooze(ann, M("a1"), B, "z"));
    return (a === true && b === true && c === true) || { a, b, c };
  });
  await check("Ben, in another household, sees none of Ann's", async () => (await mine(ben)).length === 0);
  await check("An empty key is refused", async () => (await refused(() => snooze(ann, M("a1"), A, ""))) === true);
  await check("A stranger and anon can neither read nor add", async () => {
    const s = await refused(() => snooze(stranger, M("a1"), A, "q"));
    const r = await mine(stranger);
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from waiting_snoozes").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (s === true && r.length === 0 && anonRead === true) || { s, r, anonRead };
  });
  await check("No update: a snooze is put away or taken back, never moved", async () => {
    const r = await refused(() => as(ann, "update waiting_snoozes set member_id = $1", [M("a2")]));
    return r === true;
  });
  await check("Ann takes one back; others' untouched", async () => {
    await as(ann, "delete from waiting_snoozes where item_key = 'loan-y'");
    await as(ben, "delete from waiting_snoozes");
    return (await mine(ann)).length === 1;
  });
}
