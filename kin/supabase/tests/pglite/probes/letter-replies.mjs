const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// Writing back (20261007190000).
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const annM = P("a1"), kidM = P("a2"), abeM = P("a4");
  const l = (await as(ann, "insert into time_capsules (recipient_member_id, body, opens_on, occasion) values ($1, 'Dear Kid', current_date + 5, 'Birthday') returning id", [kidM]))[0];
  const reply = (sql, who, params) => as(who, sql, params);
  await check("Kid can't write back before the letter opens", async () =>
    refused(() => reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to) values ($1, 'Thanks', current_date, $2)", kid, [annM, l.id])));
  await db.exec(`update time_capsules set opens_on = current_date - 1 where id = '${l.id}'`);
  let now;
  await check("Once it's open, Kid (a child) writes back now; it's never a card", async () => {
    now = (await reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to, open_to_sign) values ($1, 'Thank you Mama', current_date, $2, true) returning id, open_to_sign, writer_member_id", kid, [annM, l.id]))[0];
    return (now.open_to_sign === false && now.writer_member_id === kidM) || now;
  });
  await check("Ann reads the reply right away; Abe and Ben can't", async () =>
    (await as(ann, "select body from time_capsules where id = $1", [now.id]))[0]?.body === "Thank you Mama" &&
    (await as(abe, "select 1 from time_capsules where id = $1", [now.id])).length === 0 &&
    (await as(ben, "select 1 from time_capsules where id = $1", [now.id])).length === 0);
  await check("A reply sealed for later: Kid sees it, Ann only when its day comes", async () => {
    const later = (await reply("insert into time_capsules (recipient_member_id, body, opens_on, occasion, reply_to) values ($1, 'For your 60th', current_date + 9, '60th birthday', $2) returning id", kid, [annM, l.id]))[0];
    const annSees = (await as(ann, "select 1 from time_capsules where id = $1", [later.id])).length;
    const kidSees = (await as(kid, "select 1 from time_capsules where id = $1", [later.id])).length;
    const env = (await as(ann, "select * from my_sealed_letters()")).some((r) => r.id === later.id);
    const card = (await as(abe, "select * from open_cards()")).some((r) => r.recipient_member_id === annM);
    return (annSees === 0 && kidSees === 1 && env && !card) || { annSees, kidSees, env, card };
  });
  await check("An 'open when' reply: Ann sees the envelope", async () => {
    const ow = (await reply("insert into time_capsules (recipient_member_id, body, open_when, reply_to) values ($1, 'x', 'you miss me', $2) returning id", kid, [annM, l.id]))[0];
    return (await as(ann, "select * from my_open_when_letters()")).some((r) => r.id === ow.id);
  });
  await check("Only to the letter's writer, only by the one it was for", async () =>
    (await refused(() => reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to) values ($1, 'x', current_date, $2)", kid, [abeM, l.id]))) &&
    (await refused(() => reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to) values ($1, 'x', current_date, $2)", abe, [annM, l.id]))) &&
    (await refused(() => reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to) values ($1, 'x', current_date, $2)", ben, [annM, l.id]))));
  await check("Without reply_to, nobody but a reply may open today", async () =>
    refused(() => as(ann, "insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', current_date)", [kidM])));
  await check("An unopened 'open when' letter can't be answered yet", async () => {
    const ow = (await as(ann, "insert into time_capsules (recipient_member_id, body, open_when) values ($1, 'x', 'you''re sad') returning id", [kidM]))[0];
    return refused(() => reply("insert into time_capsules (recipient_member_id, body, opens_on, reply_to) values ($1, 'x', current_date, $2)", kid, [annM, ow.id]));
  });
  await check("Kid can't move a reply onto another letter", async () => {
    await as(kid, "update time_capsules set reply_to = null where id = $1", [now.id]);
    return (await as(kid, "select reply_to from time_capsules where id = $1", [now.id]))[0]?.reply_to === l.id;
  });
}
