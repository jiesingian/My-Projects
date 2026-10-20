const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const hash = (c) => c.repeat(43);
// A 1x1 PNG, base64.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// "Send it to Kin" (20261020230000): the share-sheet link, the waiting
// screenshot, who may read it and who may not.
export default async function ({ db, as, check, refused }) {
  const ann = U("a1"), kid = U("a2"), ben = U("b1"), stranger = U("ff");
  const anon = async (sql, params = []) => {
    await db.exec("set role anon");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const send = (h, mime = "image/png", data = PNG) => anon("select public.send_to_kin_by_link($1, $2, $3) as r", [h, mime, data]).then((r) => r[0].r);
  const waiting = async (member) => (await db.query("select id, family_id, member_id, mime, octet_length(data) as bytes from sent_screenshots where member_id = $1 order by created_at", [member])).rows;

  await check("Ann makes her link, and a screenshot sent with it waits for her, in her household", async () => {
    await as(ann, "select public.set_send_to_kin_token($1)", [hash("a")]);
    const r = await send(hash("a"));
    const rows = await waiting(M("a1"));
    return (r.ok === true && rows.length === 1 && rows[0].id === r.id && rows[0].family_id === A && rows[0].mime === "image/png" && rows[0].bytes === 70) || { r, rows };
  });
  await check("Ann reads her waiting screenshot and deletes it; Ben and anon see nothing of it", async () => {
    const mine = await as(ann, "select id, mime from sent_screenshots");
    const bens = await as(ben, "select id from sent_screenshots");
    const anons = await refused(() => anon("select id from sent_screenshots"));
    await as(ann, "delete from sent_screenshots");
    const left = (await db.query("select count(*)::int as n from sent_screenshots")).rows[0].n;
    return (mine.length === 1 && bens.length === 0 && anons === true && left === 0) || { mine, bens, anons, left };
  });
  await check("Nobody inserts a screenshot from the app, and nobody reads the keys", async () => {
    const ins = await refused(() => as(ann, "insert into sent_screenshots (family_id, member_id, mime, data) values ($1, $2, 'image/png', decode($3, 'base64'))", [A, M("a1"), PNG]));
    const a = await refused(() => anon("select * from send_to_kin_tokens"));
    const b = await refused(() => as(ann, "select * from send_to_kin_tokens"));
    return (ins === true && a === true && b === true) || { ins, a, b };
  });
  await check("Kin Free is told so, and nothing waits", async () => {
    await db.exec("create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select false $$");
    const r = await send(hash("a"));
    const n = (await db.query("select count(*)::int as n from sent_screenshots")).rows[0].n;
    await db.exec("create or replace function public.family_has_plus(p_family uuid) returns boolean language sql stable as $$ select true $$");
    return (r.ok === false && r.why === "plus" && n === 0) || { r, n };
  });
  await check("An unknown, malformed or empty key is 'unknown', the same for all three", async () => {
    const r = [await send(hash("z")), await send("short"), await send(hash("a") + "x"), await send(null)];
    return r.every((x) => x.ok === false && x.why === "unknown") || r;
  });
  await check("Not a picture: a PDF, bad base64, or nothing at all", async () => {
    const r = [await send(hash("a"), "application/pdf"), await send(hash("a"), "image/png", "!!!not base64!!!"), await send(hash("a"), "image/png", "")];
    const n = (await db.query("select count(*)::int as n from sent_screenshots")).rows[0].n;
    return (r.every((x) => x.ok === false && x.why === "picture") && n === 0) || { r, n };
  });
  await check("Ben's link files under Ben, never Ann, whatever else is sent", async () => {
    await as(ben, "select public.set_send_to_kin_token($1)", [hash("b")]);
    const r = await send(hash("b"));
    const rows = await waiting(M("b1"));
    return (r.ok === true && rows.length === 1 && rows[0].family_id === B && (await waiting(M("a1"))).length === 0) || { r, rows };
  });
  await check("At most five wait per member; the oldest go first", async () => {
    for (let i = 0; i < 7; i++) await send(hash("b"));
    const rows = await waiting(M("b1"));
    return rows.length === 5 || rows.length;
  });
  await check("A child in kid view can neither make a link nor use one made before kid view", async () => {
    await as(kid, "select public.set_send_to_kin_token($1)", [hash("k")]);
    await db.query("update members set kid_view = true where id = $1", [M("a2")]);
    const made = await refused(() => as(kid, "select public.set_send_to_kin_token($1)", [hash("j")]), "kid view");
    const r = await send(hash("k"));
    await db.query("update members set kid_view = false where id = $1", [M("a2")]);
    return (made === true && r.ok === false && r.why === "unknown") || { made, r };
  });
  await check("Turned off, the link is 'unknown'; a stranger with no household can't make one; anon can't at all", async () => {
    await as(ann, "select public.clear_send_to_kin_token()");
    const off = await send(hash("a"));
    const s = await refused(() => as(stranger, "select public.set_send_to_kin_token($1)", [hash("s")]), "Sign in");
    const a = await refused(() => anon("select public.set_send_to_kin_token($1)", [hash("t")]));
    const on = await as(ann, "select public.send_to_kin_link_on() as on");
    return (off.ok === false && off.why === "unknown" && s === true && a === true && on[0].on === false) || { off, s, a, on };
  });
  await check("The sweep removes what has waited a day, and only that", async () => {
    await db.query("update sent_screenshots set created_at = now() - interval '25 hours' where id = (select id from sent_screenshots order by created_at limit 1)");
    await db.exec("select public.sweep_sent_screenshots()");
    const n = (await db.query("select count(*)::int as n from sent_screenshots")).rows[0].n;
    const nobody = await refused(() => as(ann, "select public.sweep_sent_screenshots()"));
    return (n === 4 && nobody === true) || { n, nobody };
  });
}
