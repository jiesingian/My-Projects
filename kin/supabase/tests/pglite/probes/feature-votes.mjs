const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
// "What should Kin do next?" answers (20261029180000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), abe = U("a4"), dan = U("d1"), stranger = U("ff");
  const vote = (who, member, family, choice = "phone_app") =>
    as(who, "insert into feature_votes (member_id, family_id, choice) values ($1, $2, $3)", [member, family, choice]);
  const seen = async (who) => (await as(who, "select member_id from feature_votes")).map((r) => r.member_id);

  await check("Ann answers and sees her own answer", async () => {
    await vote(ann, M("a1"), A);
    const r = await seen(ann);
    return (r.length === 1 && r[0] === M("a1")) || r;
  });
  await check("Abe, in the same household, answers and sees only his own", async () => {
    await vote(abe, M("a4"), A, "group_calls");
    const r = await seen(abe);
    return (r.length === 1 && r[0] === M("a4")) || r;
  });
  await check("Nobody answers in someone else's name or household", async () => {
    const a = await refused(() => vote(ann, M("a4"), A));
    const b = await refused(() => vote(dan, M("d1"), A));
    return (a === true && b === true) || { a, b };
  });
  await check("Ann changes her answer; she can't move it to someone else", async () => {
    await as(ann, "update feature_votes set choice = 'live_alerts'");
    const moved = await refused(() => as(ann, "update feature_votes set member_id = $1", [M("a2")]));
    const mine = (await db.query("select choice from feature_votes where member_id = $1", [M("a1")])).rows[0].choice;
    const abes = (await db.query("select choice from feature_votes where member_id = $1", [M("a4")])).rows[0].choice;
    return (mine === "live_alerts" && abes === "group_calls" && moved === true) || { mine, abes, moved };
  });
  await check("Only the listed choices are accepted", async () => (await refused(() => vote(dan, M("d1"), D, "free_money"))) === true);
  await check("Nobody deletes, and another household, a stranger and anon read nothing", async () => {
    await as(ann, "delete from feature_votes").catch(() => null);
    const left = (await db.query("select count(*)::int as n from feature_votes")).rows[0].n;
    const d = await seen(dan);
    const s = await seen(stranger);
    await db.exec("set role anon");
    let anonRead;
    try {
      anonRead = await db.query("select * from feature_votes").then(() => false, () => true);
    } finally {
      await db.exec("reset role");
    }
    return (left === 2 && d.length === 0 && s.length === 0 && anonRead === true) || { left, d, s, anonRead };
  });
}
