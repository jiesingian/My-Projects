const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// "Open when..." letters (20261009090300).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const kidM = P("a2"), annM = P("a1");
  const l = (await as(ann, "insert into time_capsules (recipient_member_id, title, body, open_when, open_to_sign) values ($1, 'For a bad day', 'It gets better', '  you''re sad ', true) returning id, opens_on, open_when, open_to_sign", [kidM]))[0];
  await check("Ann writes Kid an 'open when' letter: no date, the moment kept, never a card", async () =>
    (l.opens_on === null && l.open_when === "you're sad" && l.open_to_sign === false) || l);
  await check("Kid sees the envelope (who from, the moment) but can't read it; Abe and Ben see nothing", async () => {
    const env = (await as(kid, "select * from my_open_when_letters()")).find((r) => r.id === l.id);
    const read = await as(kid, "select 1 from time_capsules where id = $1", [l.id]);
    return (env?.open_when === "you're sad" && env.writer_name === "Ann A" && !("body" in env) && read.length === 0 &&
      (await as(abe, "select 1 from time_capsules where id = $1", [l.id])).length === 0 &&
      (await as(abe, "select * from my_open_when_letters()")).every((r) => r.id !== l.id) &&
      (await as(ben, "select 1 from time_capsules where id = $1", [l.id])).length === 0) || { env, read };
  });
  await check("Nobody but Kid can open it -- not Ann who wrote it, not Abe, not Ben", async () => {
    const tries = [await as(ann, "select open_letter($1) ok", [l.id]), await as(abe, "select open_letter($1) ok", [l.id]), await as(ben, "select open_letter($1) ok", [l.id])];
    await as(ann, "update time_capsules set opened_at = now() where id = $1", [l.id]);
    const read = await as(kid, "select 1 from time_capsules where id = $1", [l.id]);
    return (tries.every((t) => t[0].ok === false) && read.length === 0) || { tries, read };
  });
  await check("Ann can still change it before it's opened", async () => {
    await as(ann, "update time_capsules set body = 'It gets better, I promise' where id = $1", [l.id]);
    return (await as(ann, "select body from time_capsules where id = $1", [l.id]))[0]?.body === "It gets better, I promise";
  });
  await check("Kid opens it, once; then reads it, and the envelope is gone", async () => {
    const first = (await as(kid, "select open_letter($1) ok", [l.id]))[0].ok;
    const again = (await as(kid, "select open_letter($1) ok", [l.id]))[0].ok;
    const body = (await as(kid, "select body from time_capsules where id = $1", [l.id]))[0]?.body;
    const env = (await as(kid, "select * from my_open_when_letters()")).some((r) => r.id === l.id);
    return (first === true && again === false && body === "It gets better, I promise" && !env) || { first, again, body, env };
  });
  await check("Once opened, Ann can't rewrite it, and Abe still can't read it", async () => {
    await as(ann, "update time_capsules set body = 'changed' where id = $1", [l.id]);
    return (await as(kid, "select body from time_capsules where id = $1", [l.id]))[0]?.body === "It gets better, I promise" &&
      (await as(abe, "select 1 from time_capsules where id = $1", [l.id])).length === 0;
  });
  await check("A child can't write one", async () =>
    refused(() => as(kid, "insert into time_capsules (recipient_member_id, body, open_when) values ($1, 'x', 'you miss me')", [annM])));
  await check("Given a date and a moment, it keeps the moment only", async () => {
    const r = (await as(ann, "insert into time_capsules (recipient_member_id, body, opens_on, open_when) values ($1, 'x', current_date + 3, 'you graduate') returning opens_on, open_when", [kidM]))[0];
    return (r.opens_on === null && r.open_when === "you graduate") || r;
  });
}
