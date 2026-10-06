// "Are you okay?" check-ins (20260930100000_member_card_and_sos.sql, #394).
// Ask -> answer, and who may see, ask, answer or change one: only the two
// people in it, only inside their own household, and answering only through
// answer_checkin().
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const D = "d0000000-0000-0000-0000-000000000000";
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1"), dan = U("d1");
  const ask = (who, fam, by, of, extra = "") =>
    as(who, `insert into member_checkins (family_id, asked_by, member_id${extra ? ", answer, answered_at" : ""}) values ($1, $2, $3${extra}) returning id`, [fam, by, of]);
  const answer = (who, id, a) => as(who, "select answer_checkin($1, $2) as asker", [id, a]);
  const row = async (id) => (await as(abe, "select answer, answered_at from member_checkins where id = $1", [id]))[0];

  let id;
  await check("A grown-up asks another member with a login", async () => { id = (await ask(ann, A, M("a1"), M("a4")))[0].id; return !!id; });
  await check("The one asked sees it", async () => (await as(abe, "select 1 from member_checkins where id = $1", [id])).length === 1);
  await check("The one asking sees it", async () => (await as(ann, "select 1 from member_checkins where id = $1", [id])).length === 1);
  await check("Someone else in the household does not", async () => (await as(kid, "select 1 from member_checkins")).length === 0);
  await check("A linked household does not", async () => (await as(ben, "select 1 from member_checkins")).length === 0);
  await check("A stranger household does not", async () => (await as(dan, "select 1 from member_checkins")).length === 0);

  await check("A child can ask too", async () => (await ask(kid, A, M("a2"), M("a1"))).length === 1);
  await check("Nobody can be asked who cannot sign in to answer", async () => refused(() => ask(ann, A, M("a1"), M("a3"))));
  await check("Nobody in another household can be asked", async () => refused(() => ask(ann, A, M("a1"), M("b1"))));
  await check("Nobody asks into another household", async () => refused(() => ask(dan, A, M("d1"), M("a1"))));
  await check("Nobody asks in someone else's name", async () => refused(() => ask(ann, A, M("a2"), M("a4"))));
  await check("Nobody asks themselves", async () => refused(() => ask(ann, A, M("a1"), M("a1"))));
  await check("A check-in cannot be written already answered", async () => refused(() => ask(ann, A, M("a1"), M("a4"), ", 'ok', now()")));
  await check("Not even from your own household's side: Dan cannot ask Ann", async () => refused(() => ask(dan, D, M("d1"), M("a1"))));

  await check("The asker cannot answer it for them", async () => (await answer(ann, id, "ok"))[0].asker === null && (await row(id)).answer === null);
  await check("Someone else in the household cannot answer it", async () => (await answer(kid, id, "ok"))[0].asker === null && (await row(id)).answer === null);
  await check("Another household cannot answer it", async () => (await answer(ben, id, "ok"))[0].asker === null && (await row(id)).answer === null);
  await check("Only 'ok' or 'call me' is an answer", async () => refused(() => answer(abe, id, "maybe")));
  await check("The one asked answers 'call me', and learns who to tell", async () => (await answer(abe, id, "call_me"))[0].asker === M("a1"));
  await check("The answer and its time are kept", async () => { const r = await row(id); return r.answer === "call_me" && !!r.answered_at; });
  await check("The asker sees the answer", async () => (await as(ann, "select answer from member_checkins where id = $1", [id]))[0].answer === "call_me");
  await check("Answering again changes nothing and tells nobody", async () => (await answer(abe, id, "ok"))[0].asker === null && (await row(id)).answer === "call_me");

  await check("No one rewrites an answer directly", async () => {
    await as(abe, "update member_checkins set answer = 'ok' where id = $1", [id]).catch(() => null);
    await as(ann, "update member_checkins set answer = 'ok' where id = $1", [id]).catch(() => null);
    return (await row(id)).answer === "call_me";
  });
  await check("No one deletes a check-in", async () => {
    await as(ann, "delete from member_checkins where id = $1", [id]).catch(() => null);
    await as(abe, "delete from member_checkins where id = $1", [id]).catch(() => null);
    return !!(await row(id));
  });
}
