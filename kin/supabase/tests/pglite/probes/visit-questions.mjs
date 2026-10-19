// Questions for the doctor (20261020002000): the household's grown-ups and
// the person themself; not a sibling, not another household, not under a
// forged author or for someone outside the household.
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";

export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), dan = U("d1"), dee = U("d2");
  const ask = (who, family, member, by, body = "Is the cough worth an X-ray?") =>
    as(who, "insert into health_visit_questions (family_id, member_id, created_by, body) values ($1, $2, $3, $4) returning id", [family, member, by, body]);
  const seen = async (who) => (await as(who, "select body from health_visit_questions order by body")).map((r) => r.body);

  let babyQ;
  await check("Ann (parent) asks about Baby A", async () => {
    babyQ = (await ask(ann, A, M("a3"), M("a1")))[0].id;
    return !!babyQ;
  });
  await check("Kid A asks about themself", async () => (await ask(kid, A, M("a2"), M("a2"), "Can I play basketball again?")).length === 1);
  await check("Ann and Abe see both", async () => (await seen(ann)).length === 2 && (await seen(abe)).length === 2);
  await check("Kid A sees only their own, not their sibling's", async () => JSON.stringify(await seen(kid)) === JSON.stringify(["Can I play basketball again?"]));
  await check("Kid A cannot ask about Baby A", async () => refused(() => ask(kid, A, M("a3"), M("a2")), "row-level security"));
  await check("Dan (another household) sees nothing", async () => (await seen(dan)).length === 0);
  await check("Dan cannot ask into House A", async () => refused(() => ask(dan, A, M("a3"), M("d1")), "row-level security"));
  await check("Dan cannot ask in his house about House A's baby", async () => refused(() => ask(dan, D, M("a3"), M("d1")), "row-level security"));
  await check("Ann cannot ask under Abe's name", async () => refused(() => ask(ann, A, M("a3"), M("a4")), "row-level security"));
  await check("Abe ticks Ann's question off", async () => {
    await as(abe, "update health_visit_questions set done = true where id = $1", [babyQ]);
    return (await db.query(`select done from health_visit_questions where id = '${babyQ}'`)).rows[0].done === true;
  });
  await check("Kid A cannot change or delete Baby A's question", async () => {
    await as(kid, "update health_visit_questions set body = 'x' where id = $1", [babyQ]);
    await as(kid, "delete from health_visit_questions where id = $1", [babyQ]);
    const r = (await db.query(`select body from health_visit_questions where id = '${babyQ}'`)).rows;
    return (r.length === 1 && r[0].body !== "x") || r;
  });
  await check("A question cannot be moved to another household's member", async () => refused(() => as(ann, "update health_visit_questions set member_id = $2 where id = $1", [babyQ, M("d2")]), "row-level security"));
  await check("Dee (child, other house) sees nothing", async () => (await seen(dee)).length === 0);
  await check("An empty question is refused", async () => refused(() => ask(ann, A, M("a3"), M("a1"), "   "), "health_visit_questions_body_length"));
  await check("Ann deletes it", async () => {
    await as(ann, "delete from health_visit_questions where id = $1", [babyQ]);
    return (await db.query(`select 1 from health_visit_questions where id = '${babyQ}'`)).rows.length === 0;
  });
}
