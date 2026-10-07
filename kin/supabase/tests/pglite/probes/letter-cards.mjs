const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const P = (s) => `00000000-0000-0000-0000-0000000000${s}`;
// A card everyone signs (20261007170000).
export default async function ({ as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), abe = U("a4"), ben = U("b1");
  const annM = P("a1"), kidM = P("a2"), abeM = P("a4");
  const day = "current_date + 20";
  await check("A child can't start a card", async () =>
    refused(() => as(kid, `insert into time_capsules (recipient_member_id, body, opens_on, occasion) values ($1, 'hi', ${day}, 'Birthday')`, [annM])));
  await as(abe, `insert into time_capsules (recipient_member_id, body, opens_on, occasion) values ($1, 'From Abe', ${day}, 'Birthday')`, [annM]);
  await check("Abe starting it tells Kid's and the others' devices, never Ann's or Abe's own; another household's none", async () => {
    const who = (await as(abe, "select endpoint from card_started_push_targets($1, (current_date + 20))", [annM])).map((r) => r.endpoint.split("/").pop());
    return (who.length > 0 && !who.includes("Ann A") && !who.includes("Abe A") && !who.includes("Ben B")) || who;
  });
  await check("Nobody else can announce Abe's card", async () =>
    (await as(kid, "select 1 from card_started_push_targets($1, (current_date + 20))", [annM])).length === 0 &&
    (await as(ben, "select 1 from card_started_push_targets($1, (current_date + 20))", [annM])).length === 0);
  await check("Abe started Ann's card: Kid sees it to sign, with who signed, not a word of it", async () => {
    const cards = await as(kid, "select * from open_cards()");
    const c = cards.find((r) => r.recipient_member_id === annM);
    return (c && c.occasion === "Birthday" && c.signers.join() === "Abe" && c.signed_by_me === false && !("body" in c)) || cards;
  });
  await check("Ann, whose card it is, doesn't see it among cards to sign; Ben (another household) sees none", async () =>
    (await as(ann, "select * from open_cards()")).every((r) => r.recipient_member_id !== annM) &&
    (await as(ben, "select * from open_cards()")).length === 0);
  await check("Kid signs it", async () => {
    await as(kid, `insert into time_capsules (recipient_member_id, body, opens_on, occasion) values ($1, 'From Kid', ${day}, 'Birthday')`, [annM]);
    const c = (await as(abe, "select * from open_cards()")).find((r) => r.recipient_member_id === annM);
    return (c?.signers.sort().join() === "Abe,Kid") || c;
  });
  await check("Once someone has signed, the card can't be announced again", async () =>
    (await as(abe, "select 1 from card_started_push_targets($1, (current_date + 20))", [annM])).length === 0);
  await check("Kid still reads only Kid's own note; Abe only Abe's", async () => {
    const k = await as(kid, "select body from time_capsules where recipient_member_id = $1", [annM]);
    const a = await as(abe, "select body from time_capsules where recipient_member_id = $1", [annM]);
    return (k.length === 1 && k[0].body === "From Kid" && a.length === 1 && a[0].body === "From Abe") || { k, a };
  });
  await check("Kid can't sign for another day, another person, or themselves", async () =>
    (await refused(() => as(kid, `insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', current_date + 21)`, [annM]))) &&
    (await refused(() => as(kid, `insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', ${day})`, [abeM]))) &&
    (await refused(() => as(kid, `insert into time_capsules (recipient_member_id, body, opens_on) values ($1, 'x', ${day})`, [kidM]))));
  await check("Ann sees envelopes from Abe and Kid, still sealed", async () => {
    const env = await as(ann, "select writer_name from my_sealed_letters()");
    return env.map((r) => r.writer_name).sort().join() === "Abe A,Kid A" || env;
  });
}
